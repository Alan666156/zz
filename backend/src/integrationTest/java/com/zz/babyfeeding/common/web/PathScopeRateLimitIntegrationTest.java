package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Q-26: the matched route decides the rate-limit scope. Matrix parameters and
 * query strings share the counter with the canonical path and can never fall
 * back to the api limit. Low thresholds keep the test fast (Q-12).
 */
@TestPropertySource(properties = {
        "app.rate-limit-api-per-minute=1000",
        "app.rate-limit-init-per-hour=2",
        "app.rate-limit-export-per-hour=2",
        "app.rate-limit-sync-per-minute=3"
})
class PathScopeRateLimitIntegrationTest extends IntegrationTestBase {

    private static final String EXPORT_PATH = "/api/v1/exports/feeding-records";
    private static final String SYNC_PATH = "/api/v1/sync/push";
    private static final String INIT_PATH = "/api/v1/devices/init";

    @Test
    void initLimitIsSharedAcrossMatrixAndQueryVariants() throws Exception {
        Map<String, Object> body = Map.of("platform", "H5", "appVersion", "1.0.0");

        MvcResult first = postJson(INIT_PATH, newDeviceId(), body);
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(first.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(first.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("1");

        MvcResult second = postJson(INIT_PATH + ";x=1", newDeviceId(), body);
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        assertThat(second.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");

        MvcResult blocked = postJson(INIT_PATH + "?x=1", newDeviceId(), body);
        assertError(blocked, 429, "RATE_LIMITED");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isNotNull();
        assertThat(body(blocked).path("data").path("scope").asText()).isEqualTo("init");
    }

    @Test
    void syncLimitIsSharedAcrossMatrixAndQueryVariants() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        String[] variants = {SYNC_PATH, SYNC_PATH + ";a=1", SYNC_PATH + "?x=1"};
        String[] expectedRemaining = {"2", "1", "0"};
        for (int index = 0; index < variants.length; index++) {
            MvcResult result = postJson(variants[index], deviceId, Map.of());
            assertThat(result.getResponse().getStatus()).isEqualTo(400);
            assertThat(result.getResponse().getHeader("X-RateLimit-Limit"))
                    .as("variant %s must use the sync limit, not the api limit", variants[index])
                    .isEqualTo("3");
            assertThat(result.getResponse().getHeader("X-RateLimit-Remaining"))
                    .isEqualTo(expectedRemaining[index]);
        }

        MvcResult blocked = postJson(SYNC_PATH + ";a=1", deviceId, Map.of());
        assertError(blocked, 429, "RATE_LIMITED");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("3");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isNotNull();
        assertThat(body(blocked).path("data").path("scope").asText()).isEqualTo("sync");
    }

    @Test
    void exportQuotaIsSharedAcrossMatrixAndQueryVariants() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        String babyId = createBaby(deviceId, "小满", true).path("id").asText();

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("babyId", babyId);
        export.put("from", "2026-10-20");
        export.put("to", "2026-10-20");

        MvcResult canonical = postJson(EXPORT_PATH, deviceId, export);
        assertThat(canonical.getResponse().getStatus()).isEqualTo(200);
        assertThat(canonical.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(canonical.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("1");

        MvcResult matrix = postJson(EXPORT_PATH + ";x=1", deviceId, export);
        assertThat(matrix.getResponse().getStatus()).isEqualTo(200);
        assertThat(matrix.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");

        MvcResult blocked = postJson(EXPORT_PATH + "?x=1", deviceId, export);
        assertError(blocked, 429, "RATE_LIMITED");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isNotNull();
        assertThat(body(blocked).path("data").path("scope").asText()).isEqualTo("export");
    }
}
