package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.redis.RateLimiter;
import com.zz.babyfeeding.common.security.DeviceIdHasher;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.config.AppProperties;
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

    private static final Duration API_WINDOW = Duration.ofMinutes(1);
    private static final Duration INIT_WINDOW = Duration.ofHours(1);
    private static final Duration EXPORT_WINDOW = Duration.ofHours(1);
    private static final Duration SYNC_WINDOW = Duration.ofMinutes(1);

    private static final String EXPORT_PATH = "/api/v1/exports/feeding-records";
    /**
     * Reservation handle shared with {@link ExportQuotaReleaseResolver}: the
     * resolver rolls the slot back before the error body is rendered, because
     * {@link #afterCompletion} runs after the response may already be committed.
     */
    static final String EXPORT_RESERVATION_ATTRIBUTE =
            RateLimitInterceptor.class.getName() + ".exportReservation";

    private final RateLimiter rateLimiter;
    private final DeviceIdHasher deviceIdHasher;
    private final int apiLimit;
    private final int initLimit;
    private final int exportLimit;
    private final int syncLimit;

    public RateLimitInterceptor(RateLimiter rateLimiter, DeviceIdHasher deviceIdHasher,
                                AppProperties appProperties) {
        this.rateLimiter = rateLimiter;
        this.deviceIdHasher = deviceIdHasher;
        this.apiLimit = appProperties.getRateLimitApiPerMinute();
        this.initLimit = appProperties.getRateLimitInitPerHour();
        this.exportLimit = appProperties.getRateLimitExportPerHour();
        this.syncLimit = appProperties.getRateLimitSyncPerMinute();
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) {
        if (HttpMethod.OPTIONS.matches(request.getMethod())) {
            return true;
        }
        // Matrix parameters are ignored by handler mapping; compare the
        // normalized path so ";..." cannot skip the per-endpoint limits (N-7).
        String path = RequestPaths.withinApplication(request);
        if (isExempt(path, request.getMethod())) {
            return true;
        }

        String deviceSubject = deviceSubject(request);
        String ipSubject = "ip:" + request.getRemoteAddr();

        RateLimiter.RateLimitResult apiResult =
                rateLimiter.acquire("api", deviceSubject, apiLimit, API_WINDOW);
        applyHeaders(response, apiResult.limit(), apiResult.remaining());
        enforce(apiResult, "api", API_WINDOW);

        if (HttpMethod.POST.matches(request.getMethod())) {
            if ("/api/v1/devices/init".equals(path)) {
                RateLimiter.RateLimitResult initResult =
                        rateLimiter.acquire("init", ipSubject, initLimit, INIT_WINDOW);
                applyHeaders(response, initResult.limit(), initResult.remaining());
                enforce(initResult, "init", INIT_WINDOW);
            } else if (EXPORT_PATH.equals(path)) {
                reserveExport(request, response, deviceSubject);
            } else if ("/api/v1/sync/push".equals(path)) {
                RateLimiter.RateLimitResult syncResult =
                        rateLimiter.acquire("sync", deviceSubject, syncLimit, SYNC_WINDOW);
                applyHeaders(response, syncResult.limit(), syncResult.remaining());
                enforce(syncResult, "sync", SYNC_WINDOW);
            }
        }
        return true;
    }

    /**
     * Q-20: the export quota counts successful issuances only. The slot is
     * reserved before validation so concurrent requests cannot overshoot; a
     * non-2xx outcome releases it again in {@link #afterCompletion}.
     */
    private void reserveExport(HttpServletRequest request, HttpServletResponse response,
                               String deviceSubject) {
        RateLimiter.Reservation reservation =
                rateLimiter.reserve("export", deviceSubject, exportLimit, EXPORT_WINDOW);
        applyHeaders(response, reservation.limit(), reservation.remaining());
        if (!reservation.allowed()) {
            throw rateLimited(reservation.limit(), reservation.retryAfterSeconds(),
                    "export", EXPORT_WINDOW);
        }
        if (reservation.key() != null) {
            request.setAttribute(EXPORT_RESERVATION_ATTRIBUTE,
                    new ExportReservation(reservation.key(), exportLimit));
        }
    }

    /**
     * Fallback only: by the time completion callbacks run, the error body may
     * already be flushed and header changes would be silently ignored. The
     * primary rollback happens in {@link ExportQuotaReleaseResolver} before
     * rendering; this keeps the quota correct for non-exception 4xx paths.
     */
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        Object value = request.getAttribute(EXPORT_RESERVATION_ATTRIBUTE);
        if (!(value instanceof ExportReservation reservation)) {
            return;
        }
        // Removing the handle makes the rollback idempotent: the resolver and
        // this callback can never decrement the same reservation twice.
        request.removeAttribute(EXPORT_RESERVATION_ATTRIBUTE);
        int status = response.getStatus();
        if (ex == null && status >= 200 && status < 300) {
            return;
        }
        long remaining = rateLimiter.release(reservation.key(), reservation.limit());
        if (remaining >= 0 && !response.isCommitted()) {
            // Failure: the quota is back to its pre-request value (Q-20).
            response.setHeader("X-RateLimit-Limit", String.valueOf(reservation.limit()));
            response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
        }
    }

    private static void enforce(RateLimiter.RateLimitResult result, String scope, Duration window) {
        if (!result.allowed()) {
            throw rateLimited(result.limit(), result.retryAfterSeconds(), scope, window);
        }
    }

    private static BusinessException rateLimited(long limit, long retryAfterSeconds,
                                                 String scope, Duration window) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("scope", scope);
        data.put("limit", limit);
        data.put("windowSeconds", window.toSeconds());
        return new BusinessException(ErrorCode.RATE_LIMITED, "请求过于频繁，请稍后重试", data)
                .withRetryAfterSeconds(retryAfterSeconds);
    }

    private static void applyHeaders(HttpServletResponse response, long limit, long remaining) {
        // remaining < 0 means Redis failed open: do not fabricate limit headers (Q-18).
        if (remaining < 0) {
            return;
        }
        response.setHeader("X-RateLimit-Limit", String.valueOf(limit));
        response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
    }

    private String deviceSubject(HttpServletRequest request) {
        DeviceContext.Identity identity = DeviceContext.get();
        if (identity != null) {
            return "dev:" + identity.hashHex();
        }
        String header = request.getHeader("X-Device-Id");
        if (header != null && UuidUtils.isUuidV4(header)) {
            return "dev:" + deviceIdHasher.hashHex(header);
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

    record ExportReservation(String key, int limit) {
    }
}
