package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.redis.RateLimiter;
import com.zz.babyfeeding.common.security.DeviceIdHasher;
import com.zz.babyfeeding.common.util.UuidUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fixed-window rate limits (section 2.4) with Redis 5 compatible commands:
 * api 120/min/device, init 10/hour/IP, export 5/hour/device, sync 30/min/device.
 * Health checks and CSV token downloads are excluded.
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private static final int API_LIMIT = 120;
    private static final int INIT_LIMIT = 10;
    private static final int EXPORT_LIMIT = 5;
    private static final int SYNC_LIMIT = 30;

    private static final Duration API_WINDOW = Duration.ofMinutes(1);
    private static final Duration INIT_WINDOW = Duration.ofHours(1);
    private static final Duration EXPORT_WINDOW = Duration.ofHours(1);
    private static final Duration SYNC_WINDOW = Duration.ofMinutes(1);

    private final RateLimiter rateLimiter;
    private final DeviceIdHasher deviceIdHasher;

    public RateLimitInterceptor(RateLimiter rateLimiter, DeviceIdHasher deviceIdHasher) {
        this.rateLimiter = rateLimiter;
        this.deviceIdHasher = deviceIdHasher;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        if (isExempt(path, request.getMethod())) {
            return true;
        }

        String deviceSubject = deviceSubject(request);
        String ipSubject = "ip:" + request.getRemoteAddr();

        RateLimiter.RateLimitResult apiResult =
                rateLimiter.acquire("api", deviceSubject, API_LIMIT, API_WINDOW);
        applyHeaders(response, apiResult);
        enforce(apiResult, "api", API_WINDOW);

        if (HttpMethod.POST.matches(request.getMethod())) {
            if ("/api/v1/devices/init".equals(path)) {
                RateLimiter.RateLimitResult initResult =
                        rateLimiter.acquire("init", ipSubject, INIT_LIMIT, INIT_WINDOW);
                enforce(initResult, "init", INIT_WINDOW);
            } else if ("/api/v1/exports/feeding-records".equals(path)) {
                RateLimiter.RateLimitResult exportResult =
                        rateLimiter.acquire("export", deviceSubject, EXPORT_LIMIT, EXPORT_WINDOW);
                applyHeaders(response, exportResult);
                enforce(exportResult, "export", EXPORT_WINDOW);
            } else if ("/api/v1/sync/push".equals(path)) {
                RateLimiter.RateLimitResult syncResult =
                        rateLimiter.acquire("sync", deviceSubject, SYNC_LIMIT, SYNC_WINDOW);
                enforce(syncResult, "sync", SYNC_WINDOW);
            }
        }
        return true;
    }

    private static void enforce(RateLimiter.RateLimitResult result, String scope, Duration window) {
        if (!result.allowed()) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("scope", scope);
            data.put("limit", result.limit());
            data.put("windowSeconds", window.toSeconds());
            throw new BusinessException(ErrorCode.RATE_LIMITED, "请求过于频繁，请稍后重试", data)
                    .withRetryAfterSeconds(result.retryAfterSeconds());
        }
    }

    private static void applyHeaders(HttpServletResponse response, RateLimiter.RateLimitResult result) {
        response.setHeader("X-RateLimit-Limit", String.valueOf(result.limit()));
        if (result.remaining() >= 0) {
            response.setHeader("X-RateLimit-Remaining", String.valueOf(result.remaining()));
        }
    }

    private String deviceSubject(HttpServletRequest request) {
        DeviceContext.Identity identity = DeviceContext.get();
        if (identity != null) {
            return "dev:" + identity.hashHex();
        }
        String header = request.getHeader("X-Device-Id");
        if (header != null && UuidUtils.isUuidV4(header.trim())) {
            return "dev:" + deviceIdHasher.hashHex(UuidUtils.normalize(header.trim()));
        }
        return "ip:" + request.getRemoteAddr();
    }

    private static boolean isExempt(String path, String method) {
        if ("/api/v1/health".equals(path) || path.startsWith("/api/v1/health/")) {
            return true;
        }
        return HttpMethod.GET.matches(method)
                && path.startsWith("/api/v1/exports/feeding-records/");
    }
}
