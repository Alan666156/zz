package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.security.DeviceIdHasher;
import com.zz.babyfeeding.common.util.UuidUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Optional;

/**
 * Validates X-Device-Id, resolves the device row and exposes it via
 * DeviceContext. Health, device init and CSV token downloads are exempt.
 */
@Component
public class DeviceContextInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(DeviceContextInterceptor.class);

    private final DeviceIdHasher deviceIdHasher;
    private final DeviceRegistry deviceRegistry;

    public DeviceContextInterceptor(DeviceIdHasher deviceIdHasher, DeviceRegistry deviceRegistry) {
        this.deviceIdHasher = deviceIdHasher;
        this.deviceRegistry = deviceRegistry;
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

        String header = request.getHeader("X-Device-Id");
        if (header == null || header.isBlank()) {
            throw new BusinessException(ErrorCode.DEVICE_ID_REQUIRED);
        }
        header = header.trim();
        if (!UuidUtils.isUuidV4(header)) {
            throw new BusinessException(ErrorCode.DEVICE_ID_INVALID);
        }

        String normalizedDeviceId = UuidUtils.normalize(header);
        byte[] hash = deviceIdHasher.hash(normalizedDeviceId);
        String hashHex = DeviceIdHasher.toHex(hash);

        Optional<DeviceRegistry.RegisteredDevice> registered =
                deviceRegistry.find(hashHex, hash);
        if (registered.isEmpty()) {
            throw new BusinessException(ErrorCode.DEVICE_NOT_REGISTERED);
        }
        DeviceRegistry.RegisteredDevice device = registered.get();
        if (!"ACTIVE".equals(device.status())) {
            throw new BusinessException(ErrorCode.DEVICE_DISABLED);
        }

        DeviceContext.set(new DeviceContext.Identity(normalizedDeviceId, hashHex, device.id()));
        log.debug("device resolved deviceHash={}", hashHex.substring(0, 8));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                Object handler, Exception ex) {
        DeviceContext.clear();
    }

    private static boolean isExempt(String path, String method) {
        if ("/api/v1/health".equals(path) || path.startsWith("/api/v1/health/")) {
            return true;
        }
        if ("/api/v1/devices/init".equals(path)) {
            return true;
        }
        return HttpMethod.GET.matches(method)
                && path.startsWith("/api/v1/exports/feeding-records/");
    }
}
