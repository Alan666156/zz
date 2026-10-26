package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.redis.RateLimiter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.ModelAndView;

/**
 * Q-20 / EXP-09: releases an export quota reservation before the error body is
 * rendered. {@link RateLimitInterceptor#afterCompletion} is too late for this:
 * by then the JSON error has been flushed, the response is committed, and
 * {@code setHeader} is silently ignored, leaving {@code X-RateLimit-Remaining}
 * at the reserved value instead of the rolled-back one.
 *
 * <p>Registered as a {@link HandlerExceptionResolver} bean ordered at
 * {@link Ordered#HIGHEST_PRECEDENCE}; {@code DispatcherServlet} sorts all
 * resolver beans, so this runs before the {@code HandlerExceptionResolver}
 * composite that contains {@code ExceptionHandlerExceptionResolver}.
 * {@code WebMvcConfigurer#extendHandlerExceptionResolvers} is deliberately not
 * used: it appends resolvers after the defaults, which is exactly too late.
 *
 * <p>Returning {@code null} lets the regular {@code @RestControllerAdvice}
 * render the error envelope afterwards.
 */
@Component
public class ExportQuotaReleaseResolver implements HandlerExceptionResolver, Ordered {

    private final RateLimiter rateLimiter;

    public ExportQuotaReleaseResolver(RateLimiter rateLimiter) {
        this.rateLimiter = rateLimiter;
    }

    @Override
    @Nullable
    public ModelAndView resolveException(HttpServletRequest request,
                                         HttpServletResponse response,
                                         @Nullable Object handler,
                                         Exception ex) {
        Object value = request.getAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE);
        if (!(value instanceof RateLimitInterceptor.ExportReservation reservation)) {
            return null;
        }
        // Remove first so the afterCompletion fallback can never release again.
        request.removeAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE);
        long remaining = rateLimiter.release(reservation.key(), reservation.limit());
        if (remaining >= 0) {
            // Not committed yet: this is what the client actually receives.
            response.setHeader("X-RateLimit-Limit", String.valueOf(reservation.limit()));
            response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
        }
        return null;
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
