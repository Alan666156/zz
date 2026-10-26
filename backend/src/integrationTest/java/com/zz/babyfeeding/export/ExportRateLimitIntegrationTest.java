package com.zz.babyfeeding.export;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Q-20: the export quota counts successful issuances only. Failed requests
 * (400/413/500) reserve and then roll back, so they never consume a slot;
 * downloads are exempt.
 */
@TestPropertySource(properties = {
        "app.rate-limit-export-per-hour=5",
        "app.rate-limit-api-per-minute=1000"
})
class ExportRateLimitIntegrationTest extends IntegrationTestBase {

    private static final String EXPORT_PATH = "/api/v1/exports/feeding-records";

    private static Map<String, Object> exportBody(String babyId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("babyId", babyId);
        body.put("from", "2026-10-20");
        body.put("to", "2026-10-20");
        return body;
    }

    @Test
    void onlySuccessfulIssuancesConsumeTheQuota() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        String babyId = createBaby(deviceId, "小满", true).path("id").asText();

        // from > to: a 400 that must not consume the export quota.
        Map<String, Object> invalid = new LinkedHashMap<>();
        invalid.put("babyId", babyId);
        invalid.put("from", "2026-10-21");
        invalid.put("to", "2026-10-20");

        for (int attempt = 0; attempt < 5; attempt++) {
            MvcResult rejected = postJson(EXPORT_PATH, deviceId, invalid);
            assertError(rejected, 400, "VALIDATION_ERROR");
            assertThat(rejected.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("5");
            assertThat(rejected.getResponse().getHeader("X-RateLimit-Remaining"))
                    .as("failure %s must not consume quota", attempt + 1)
                    .isEqualTo("5");
        }

        // The whole quota is still available: 5 -> 4 -> 3 -> 2 -> 1 -> 0.
        int[] expectedRemaining = {4, 3, 2, 1, 0};
        String downloadUrl = null;
        for (int index = 0; index < 5; index++) {
            MvcResult issued = postJson(EXPORT_PATH, deviceId, exportBody(babyId));
            assertThat(issued.getResponse().getStatus()).isEqualTo(200);
            assertThat(issued.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("5");
            assertThat(issued.getResponse().getHeader("X-RateLimit-Remaining"))
                    .isEqualTo(String.valueOf(expectedRemaining[index]));
            downloadUrl = body(issued).path("data").path("downloadUrl").asText();
        }

        // Downloads do not consume the quota.
        for (int attempt = 0; attempt < 3; attempt++) {
            assertThat(getJson(downloadUrl, null).getResponse().getStatus()).isEqualTo(200);
        }

        MvcResult blocked = postJson(EXPORT_PATH, deviceId, exportBody(babyId));
        assertError(blocked, 429, "RATE_LIMITED");
        JsonNode data = body(blocked).path("data");
        assertThat(data.path("scope").asText()).isEqualTo("export");
        assertThat(data.path("limit").asInt()).isEqualTo(5);
        assertThat(data.path("windowSeconds").asLong()).isEqualTo(3600);
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("5");
        assertThat(blocked.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
        long retryAfter = Long.parseLong(blocked.getResponse().getHeader("Retry-After"));
        assertThat(retryAfter).isBetween(1L, 3600L);

        // Full quota is checked before business validation: invalid body is 429.
        assertError(postJson(EXPORT_PATH, deviceId, invalid), 429, "RATE_LIMITED");
    }
}
