package com.zz.babyfeeding.common.web;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;

class RateLimitIntegrationTest extends IntegrationTestBase {

    @Test
    void deviceInitIsLimitedToTenPerHourPerIp() throws Exception {
        for (int i = 0; i < 10; i++) {
            assertThat(initDevice(newDeviceId()).getResponse().getStatus()).isEqualTo(200);
        }

        MvcResult blocked = initDevice(newDeviceId());
        assertError(blocked, 429, "RATE_LIMITED");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isNotNull();
        assertThat(Long.parseLong(blocked.getResponse().getHeader("Retry-After")))
                .isBetween(1L, 3600L);
        // Q-18: headers describe the window that rejected the request.
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("10");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        JsonNode data = body(blocked).path("data");
        assertThat(data.path("scope").asText()).isEqualTo("init");
        assertThat(data.path("limit").asInt()).isEqualTo(10);
        assertThat(data.path("windowSeconds").asLong()).isEqualTo(3600L);
    }

    @Test
    void apiIsLimitedTo120PerMinutePerDevice() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        MvcResult first = getJson("/api/v1/babies", deviceId);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(first.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("120");
        // init used one slot, this request uses the second.
        assertThat(first.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("118");

        for (int i = 0; i < 118; i++) {
            assertThat(getJson("/api/v1/babies", deviceId).getResponse().getStatus())
                    .isEqualTo(200);
        }

        MvcResult blocked = getJson("/api/v1/babies", deviceId);
        assertError(blocked, 429, "RATE_LIMITED");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isNotNull();
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("120");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        assertThat(body(blocked).path("data").path("scope").asText()).isEqualTo("api");
    }
}
