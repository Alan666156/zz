package com.zz.babyfeeding.export;

import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.TestPropertySource;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * EXP-09 real-container regression: {@code afterCompletion} runs after the
 * error body has been flushed, so a rollback there cannot rewrite the rate
 * limit headers. A MockMvc response is never committed, which hides the bug;
 * this test goes through a real servlet container and real HTTP.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "app.rate-limit-export-per-hour=5",
        "app.rate-limit-api-per-minute=1000"
})
class ExportQuotaRealServerIntegrationTest extends IntegrationTestBase {

    private static final String EXPORT_PATH = "/api/v1/exports/feeding-records";

    @Autowired
    private TestRestTemplate rest;

    @Test
    void failedExportResponsesExposeTheRolledBackRemainingHeader() {
        String deviceId = newDeviceId();
        ResponseEntity<String> init = rest.exchange(
                "/api/v1/devices/init", HttpMethod.POST, entity(deviceId,
                        Map.of("platform", "H5", "appVersion", "1.0.0")),
                String.class);
        assertThat(init.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<String> baby = rest.exchange(
                "/api/v1/babies", HttpMethod.POST, entity(deviceId,
                        babyPayload("小满", true)),
                String.class);
        assertThat(baby.getStatusCode()).isEqualTo(HttpStatus.OK);
        String babyId = readTree(baby).path("data").path("baby").path("id").asText();

        Map<String, Object> invalid = new LinkedHashMap<>();
        invalid.put("babyId", babyId);
        invalid.put("from", "2026-10-21");
        invalid.put("to", "2026-10-20");

        // 5 rejected requests must not consume a slot. This is the regression:
        // the header used to stay at the reservation value (4).
        for (int attempt = 0; attempt < 5; attempt++) {
            ResponseEntity<String> failed = rest.exchange(
                    EXPORT_PATH, HttpMethod.POST, entity(deviceId, invalid), String.class);
            assertThat(failed.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
            assertThat(failed.getHeaders().getFirst("X-RateLimit-Limit")).isEqualTo("5");
            assertThat(failed.getHeaders().getFirst("X-RateLimit-Remaining"))
                    .as("failed attempt %s must report the rolled-back quota", attempt + 1)
                    .isEqualTo("5");
        }

        // The whole quota is still available: 5 -> 4 -> 3 -> 2 -> 1 -> 0.
        Map<String, Object> valid = new LinkedHashMap<>();
        valid.put("babyId", babyId);
        valid.put("from", "2026-10-20");
        valid.put("to", "2026-10-20");
        int[] expectedRemaining = {4, 3, 2, 1, 0};
        for (int index = 0; index < 5; index++) {
            ResponseEntity<String> issued = rest.exchange(
                    EXPORT_PATH, HttpMethod.POST, entity(deviceId, valid), String.class);
            assertThat(issued.getStatusCode()).isEqualTo(HttpStatus.OK);
            assertThat(issued.getHeaders().getFirst("X-RateLimit-Limit")).isEqualTo("5");
            assertThat(issued.getHeaders().getFirst("X-RateLimit-Remaining"))
                    .isEqualTo(String.valueOf(expectedRemaining[index]));
        }

        ResponseEntity<String> blocked = rest.exchange(
                EXPORT_PATH, HttpMethod.POST, entity(deviceId, valid), String.class);
        assertThat(blocked.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(blocked.getHeaders().getFirst("X-RateLimit-Limit")).isEqualTo("5");
        assertThat(blocked.getHeaders().getFirst("X-RateLimit-Remaining")).isEqualTo("0");
        assertThat(blocked.getHeaders().getFirst("Retry-After")).isNotNull();
    }

    private HttpEntity<Object> entity(String deviceId, Map<String, Object> payload) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Device-Id", deviceId);
        return new HttpEntity<>(payload, headers);
    }

    private com.fasterxml.jackson.databind.JsonNode readTree(ResponseEntity<String> response) {
        try {
            return objectMapper.readTree(response.getBody());
        } catch (Exception ex) {
            throw new IllegalStateException("response body is not JSON: " + response.getBody(), ex);
        }
    }
}
