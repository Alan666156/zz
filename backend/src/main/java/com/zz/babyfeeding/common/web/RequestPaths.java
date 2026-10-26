package com.zz.babyfeeding.common.web;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.util.UrlPathHelper;
import org.springframework.web.util.pattern.PathPattern;

/**
 * Canonical path used to decide rate-limit scopes and public exemptions
 * (contract addendum Q-26).
 *
 * <p>Spring's handler mapping matches {@code "/api/v1/sync/push;x=y"} to the
 * {@code /api/v1/sync/push} handler because URL matrix parameters are ignored.
 * Comparing the raw {@code getRequestURI()} would then skip the endpoint's own
 * limit or device check (N-7). Scope is therefore based on the matched route:
 * the handler mapping stores it in
 * {@link HandlerMapping#BEST_MATCHING_PATTERN_ATTRIBUTE} before interceptors
 * run. Only when that attribute is missing (no HandlerMapping participation)
 * do we fall back to the {@link UrlPathHelper} lookup path, which removes the
 * context/servlet path, decodes and strips semicolon content.
 *
 * <p>Pattern strings contain no query string or matrix content, so
 * {@code ;a=1} and {@code ?a=1} variants share the canonical route. There is
 * no case folding; an unmatched request keeps its literal path and is treated
 * with the strict default scope rather than being exempted.
 */
final class RequestPaths {

    private static final UrlPathHelper HELPER = new UrlPathHelper();

    private RequestPaths() {
    }

    /**
     * Canonical route path for scope decisions. Never null and never empty.
     */
    static String scopePath(HttpServletRequest request) {
        Object pattern = request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE);
        if (pattern instanceof PathPattern pathPattern) {
            String value = pathPattern.getPatternString();
            if (!value.isEmpty()) {
                return value;
            }
        } else if (pattern instanceof CharSequence text) {
            String value = text.toString();
            if (!value.isEmpty()) {
                return value;
            }
        }
        return withinApplication(request);
    }

    /**
     * Application-relative lookup path, used only as the fallback when the
     * handler mapping did not record a matching pattern. Semicolon content is
     * removed by {@link UrlPathHelper}'s defaults; the query string is not part
     * of a request URI.
     */
    static String withinApplication(HttpServletRequest request) {
        String path = HELPER.getPathWithinApplication(request);
        return (path == null || path.isEmpty()) ? "/" : path;
    }
}
