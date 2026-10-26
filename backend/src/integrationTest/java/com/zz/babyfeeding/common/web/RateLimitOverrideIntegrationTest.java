package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Proves the rate limits can be lowered per environment (Q-12) without touching
 * code, which is also how E2E tests exercise throttling.
 */
@TestPropertySource(properties = {
        "app.rate-limit-api-per-minute=3",
        "app.rate-limit-init-per-hour=2"
})
class RateLimitOverrideIntegrationTest extends IntegrationTestBase {

    @Test
    void initLimitComesFromConfiguration() throws Exception {
        MvcResult first = initDevice(newDeviceId());
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(first.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(first.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("1");

        MvcResult second = initDevice(newDeviceId());
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        assertThat(second.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");

        MvcResult third = initDevice(newDeviceId());
        assertError(third, 429, "RATE_LIMITED");
        assertThat(third.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(third.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
    }

    @Test
    void apiLimitComesFromConfiguration() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        MvcResult first = getJson("/api/v1/babies", deviceId);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(first.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("3");
        assertThat(first.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("1");

        MvcResult second = getJson("/api/v1/babies", deviceId);
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        assertThat(second.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");

        MvcResult third = getJson("/api/v1/babies", deviceId);
        assertError(third, 429, "RATE_LIMITED");
        assertThat(third.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("3");
        assertThat(third.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
    }
}
