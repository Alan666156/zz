package com.zz.babyfeeding.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.util.UrlPathHelper;

/**
 * Application-relative path used by interceptors for exact endpoint checks.
 *
 * <p>Spring's handler mapping matches {@code "/api/v1/sync/push;x=y"} to the
 * {@code /api/v1/sync/push} handler because URL matrix parameters are ignored.
 * Comparing the raw {@code getRequestURI()} would then skip the endpoint's own
 * rate limit or device exemption (N-7). {@link UrlPathHelper} with its defaults
 * removes the context/servlet path, decodes the URI and strips matrix content,
 * so both forms compare identically. Matrix content is never used by this API.
 */
final class RequestPaths {

    private static final UrlPathHelper HELPER = new UrlPathHelper();

    private RequestPaths() {
    }

    static String withinApplication(HttpServletRequest request) {
        return HELPER.getPathWithinApplication(request);
    }
}
