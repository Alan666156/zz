package com.zz.babyfeeding.common.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.util.pattern.PathPatternParser;

import static org.assertj.core.api.Assertions.assertThat;

class RequestPathsTest {

    @Test
    void prefersTheMatchedRouteOverTheRawRequestUri() {
        MockHttpServletRequest request = request("/api/v1/sync/push;a=1");
        request.setQueryString("ignored=1");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,
                new PathPatternParser().parse("/api/v1/sync/push"));

        assertThat(RequestPaths.scopePath(request)).isEqualTo("/api/v1/sync/push");
    }

    @Test
    void acceptsAStringPatternAttribute() {
        MockHttpServletRequest request = request("/api/v1/devices/init;x=1");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE,
                "/api/v1/devices/init");

        assertThat(RequestPaths.scopePath(request)).isEqualTo("/api/v1/devices/init");
    }

    @Test
    void fallsBackToTheSemicolonFreeLookupPath() {
        assertThat(RequestPaths.scopePath(request("/api/v1/sync/push;x=y")))
                .isEqualTo("/api/v1/sync/push");
        assertThat(RequestPaths.scopePath(request("/api/v1/devices/init;a=1")))
                .isEqualTo("/api/v1/devices/init");
        assertThat(RequestPaths.scopePath(request("/api/v1/exports/feeding-records;session=abc")))
                .isEqualTo("/api/v1/exports/feeding-records");
    }

    @Test
    void ignoresAnEmptyPatternAttribute() {
        MockHttpServletRequest request = request("/api/v1/babies;x=1");
        request.setAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE, "");

        assertThat(RequestPaths.scopePath(request)).isEqualTo("/api/v1/babies");
    }

    @Test
    void doesNotFoldCase() {
        assertThat(RequestPaths.scopePath(request("/API/V1/HEALTH")))
                .isEqualTo("/API/V1/HEALTH");
    }

    @Test
    void stripsTheContextPathInTheFallback() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("/zz");
        request.setRequestURI("/zz/api/v1/health;x");

        assertThat(RequestPaths.withinApplication(request)).isEqualTo("/api/v1/health");
    }

    @Test
    void keepsTrailingSlashesSoTheyCannotLookLikeAnotherEndpoint() {
        assertThat(RequestPaths.scopePath(request("/api/v1/devices/init/")))
                .isEqualTo("/api/v1/devices/init/");
    }

    private static MockHttpServletRequest request(String requestUri) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI(requestUri);
        return request;
    }
}
