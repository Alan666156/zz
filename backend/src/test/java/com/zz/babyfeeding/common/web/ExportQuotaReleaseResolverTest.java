package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.redis.RateLimiter;
import org.junit.jupiter.api.Test;
import org.springframework.core.Ordered;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.servlet.ModelAndView;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * EXP-09: the rollback has to happen in the exception resolver, before the
 * error body is committed; {@code afterCompletion} is only a fallback.
 */
class ExportQuotaReleaseResolverTest {

    private final RateLimiter rateLimiter = mock(RateLimiter.class);
    private final ExportQuotaReleaseResolver resolver =
            new ExportQuotaReleaseResolver(rateLimiter);

    @Test
    void releasesBeforeRenderingAndWritesTheRolledBackRemaining() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.setAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE,
                new RateLimitInterceptor.ExportReservation("rl-key", 5));
        when(rateLimiter.release("rl-key", 5)).thenReturn(5L);

        ModelAndView mav = resolver.resolveException(
                request, response, new Object(), new IllegalStateException("boom"));

        assertThat(mav).as("must let the @RestControllerAdvice render the error").isNull();
        verify(rateLimiter).release("rl-key", 5);
        assertThat(response.getHeader("X-RateLimit-Limit")).isEqualTo("5");
        assertThat(response.getHeader("X-RateLimit-Remaining")).isEqualTo("5");
        assertThat(request.getAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE))
                .as("handle removed so the fallback cannot release twice")
                .isNull();
    }

    @Test
    void neverReleasesTheSameReservationTwice() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.setAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE,
                new RateLimitInterceptor.ExportReservation("rl-key", 5));
        when(rateLimiter.release("rl-key", 5)).thenReturn(5L);

        resolver.resolveException(request, response, null, new RuntimeException("first"));
        resolver.resolveException(request, response, null, new RuntimeException("second"));

        verify(rateLimiter, times(1)).release("rl-key", 5);
    }

    @Test
    void leavesHeadersUntouchedWhenTheRollbackFailsOpen() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.setAttribute(RateLimitInterceptor.EXPORT_RESERVATION_ATTRIBUTE,
                new RateLimitInterceptor.ExportReservation("rl-key", 5));
        when(rateLimiter.release("rl-key", 5)).thenReturn(-1L);

        resolver.resolveException(request, response, null, new RuntimeException("boom"));

        assertThat(response.getHeader("X-RateLimit-Limit")).isNull();
        assertThat(response.getHeader("X-RateLimit-Remaining")).isNull();
    }

    @Test
    void ignoresExceptionsThatDidNotReserveAnExportSlot() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        resolver.resolveException(request, response, null, new RuntimeException("other"));

        verifyNoInteractions(rateLimiter);
    }

    @Test
    void runsBeforeTheDefaultExceptionResolvers() {
        assertThat(resolver.getOrder()).isEqualTo(Ordered.HIGHEST_PRECEDENCE);
    }
}
