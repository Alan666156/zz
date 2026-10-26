package com.zz.babyfeeding.common.web;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.assertj.core.api.Assertions.assertThat;

class RequestPathsTest {

    @Test
    void stripsMatrixParametersSoEndpointChecksStillMatch() {
        assertThat(path("/api/v1/sync/push;x=y")).isEqualTo("/api/v1/sync/push");
        assertThat(path("/api/v1/devices/init;a=1")).isEqualTo("/api/v1/devices/init");
        assertThat(path("/api/v1/exports/feeding-records;session=abc"))
                .isEqualTo("/api/v1/exports/feeding-records");
    }

    @Test
    void keepsPathsWithoutMatrixContentUnchanged() {
        assertThat(path("/api/v1/exports/feeding-records"))
                .isEqualTo("/api/v1/exports/feeding-records");
        assertThat(path("/api/v1/babies"))
                .isEqualTo("/api/v1/babies");
    }

    @Test
    void stripsTheContextPath() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContextPath("/zz");
        request.setRequestURI("/zz/api/v1/health;x");
        assertThat(RequestPaths.withinApplication(request)).isEqualTo("/api/v1/health");
    }

    private static String path(String requestUri) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRequestURI(requestUri);
        return RequestPaths.withinApplication(request);
    }
}
