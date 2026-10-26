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
 * Q-12: the export quota must come from configuration (5/hour by default) and
 * only POSTs consume it; signed downloads are exempt.
 */
@TestPropertySource(properties = {
        "app.rate-limit-export-per-hour=2",
        "app.rate-limit-api-per-minute=1000"
})
class ExportRateLimitIntegrationTest extends IntegrationTestBase {

    private static Map<String, Object> exportBody(String babyId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("babyId", babyId);
        body.put("from", "2026-10-20");
        body.put("to", "2026-10-20");
        return body;
    }

    @Test
    void thirdTicketRequestIsRateLimitedWhileDownloadsAreExempt() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        String babyId = createBaby(deviceId, "小满", true).path("id").asText();

        MvcResult first = postJson("/api/v1/exports/feeding-records", deviceId,
                exportBody(babyId));
        assertThat(first.getResponse().getStatus()).isEqualTo(200);
        assertThat(first.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(first.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("1");
        JsonNode ticket = body(first).path("data");
        String downloadUrl = ticket.path("downloadUrl").asText();

        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(getJson(downloadUrl, null).getResponse().getStatus()).isEqualTo(200);
        }

        MvcResult second = postJson("/api/v1/exports/feeding-records", deviceId,
                exportBody(babyId));
        assertThat(second.getResponse().getStatus()).isEqualTo(200);
        assertThat(second.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");

        MvcResult third = postJson("/api/v1/exports/feeding-records", deviceId,
                exportBody(babyId));
        assertError(third, 429, "RATE_LIMITED");
        JsonNode data = body(third).path("data");
        assertThat(data.path("scope").asText()).isEqualTo("export");
        assertThat(data.path("limit").asInt()).isEqualTo(2);
        assertThat(data.path("windowSeconds").asLong()).isEqualTo(3600);
        assertThat(third.getResponse().getHeader("Retry-After")).isNotBlank();
        assertThat(third.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("2");
        assertThat(third.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("0");
    }
}
