package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * N-7 follow-up: normalizing matrix parameters must keep the public
 * exemptions intact (health, CSV download) without widening them to
 * similarly named paths.
 */
class MatrixParameterExemptionIntegrationTest extends IntegrationTestBase {

    @Test
    void healthWithMatrixParametersStaysExempt() throws Exception {
        MvcResult result = getJson("/api/v1/health;x", null);

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getHeader("X-RateLimit-Limit"))
                .as("health is not rate limited")
                .isNull();
    }

    @Test
    void csvDownloadWithMatrixParametersStaysExempt() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        String babyId = createBaby(deviceId, "小满", true).path("id").asText();

        Map<String, Object> export = new LinkedHashMap<>();
        export.put("babyId", babyId);
        export.put("from", "2026-10-20");
        export.put("to", "2026-10-20");
        MvcResult issued = postJson("/api/v1/exports/feeding-records", deviceId, export);
        assertThat(issued.getResponse().getStatus()).isEqualTo(200);
        String downloadUrl = body(issued).path("data").path("downloadUrl").asText();

        MvcResult csv = getJson(downloadUrl + ";x", null);

        assertThat(csv.getResponse().getStatus()).isEqualTo(200);
        assertThat(csv.getResponse().getContentType()).startsWith("text/csv");
        assertThat(csv.getResponse().getHeader("X-RateLimit-Limit"))
                .as("CSV downloads are not rate limited")
                .isNull();
    }

    @Test
    void similarlyNamedPathsAreNotExempt() throws Exception {
        MvcResult result = getJson("/api/v1/healthcheck;x", null);

        // Not treated as the public health endpoint: no handler exists here,
        // so the request ends as a contract 404 instead of a 200 health body.
        assertThat(result.getResponse().getStatus()).isEqualTo(404);
        assertThat(body(result).path("code").asText()).isEqualTo("NOT_FOUND");
    }

    @Test
    void pathVariantsDoNotExemptProtectedEndpointsFromTheDeviceHeader() throws Exception {
        for (String path : new String[]{"/api/v1/babies;x=1", "/api/v1/babies?x=1"}) {
            MvcResult result = getJson(path, null);
            assertThat(result.getResponse().getStatus()).isEqualTo(400);
            assertThat(body(result).path("code").asText())
                    .as("%s must still require X-Device-Id", path)
                    .isEqualTo("DEVICE_ID_REQUIRED");
        }
    }
}
