package com.zz.babyfeeding.health;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** The health probe must work without a device header and report both dependencies. */
class HealthIntegrationTest extends IntegrationTestBase {

    @Test
    void reportsUpWithBothDependencies() throws Exception {
        MvcResult result = getJson("/api/v1/health", null);

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode root = body(result);
        assertThat(root.path("code").asText()).isEqualTo("OK");
        JsonNode data = root.path("data");
        assertThat(data.path("status").asText()).isEqualTo("UP");
        assertThat(data.path("checks").path("db").path("status").asText()).isEqualTo("UP");
        assertThat(data.path("checks").path("redis").path("status").asText()).isEqualTo("UP");
        assertThat(data.path("checks").path("db").has("error")).isFalse();
        assertThat(data.path("checks").path("redis").has("error")).isFalse();
        assertThat(data.path("version").asText()).isEqualTo("1.0.0-test");
        assertThat(data.path("serverTime").asText()).matches(
                "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
        assertThat(root.path("serverTime").asText()).endsWith("Z");
        assertThat(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .doesNotContain("root123");
    }
}
