package com.zz.babyfeeding.device;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

class DeviceIntegrationTest extends IntegrationTestBase {

    @Test
    void initIsIdempotentAndStoresOnlyHmacDigest() throws Exception {
        String deviceId = newDeviceId();

        MvcResult firstResult = initDevice(deviceId);
        assertThat(firstResult.getResponse().getStatus()).isEqualTo(200);
        JsonNode first = body(firstResult);
        assertThat(first.path("code").asText()).isEqualTo("OK");
        assertThat(first.path("data").path("deviceId").asText()).isEqualTo(deviceId);
        assertThat(first.path("data").path("created").asBoolean()).isTrue();
        String firstSeenAt = first.path("data").path("firstSeenAt").asText();
        assertThat(firstSeenAt).endsWith("Z");
        assertThat(first.path("data").path("serverTime").asText()).endsWith("Z");
        assertThat(first.path("requestId").asText()).isNotBlank();
        assertThat(firstResult.getResponse().getHeader("X-Request-Id"))
                .isEqualTo(first.path("requestId").asText());
        assertThat(firstResult.getResponse().getHeader("X-API-Version")).isEqualTo("1");
        assertThat(firstResult.getResponse().getHeader("X-Content-Type-Options"))
                .isEqualTo("nosniff");

        MvcResult secondResult = postJson("/api/v1/devices/init", deviceId,
                Map.of("platform", "H5", "appVersion", "1.1.0"));
        JsonNode second = body(secondResult);
        assertThat(second.path("data").path("created").asBoolean()).isFalse();
        assertThat(second.path("data").path("firstSeenAt").asText()).isEqualTo(firstSeenAt);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device", Integer.class)).isEqualTo(1);
        byte[] storedHash = jdbcTemplate.queryForObject(
                "SELECT device_uid_hash FROM device", (rs, rowNum) -> rs.getBytes(1));
        assertThat(storedHash).hasSize(32).isEqualTo(deviceIdHasher.hash(deviceId));
        assertThat(new String(storedHash, StandardCharsets.UTF_8)).doesNotContain(deviceId);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT app_version FROM device", String.class)).isEqualTo("1.1.0");

        // init evicts the device resolution cache so the refreshed row is re-read.
        assertThat(stringRedisTemplate.hasKey(deviceCacheKey(deviceId))).isFalse();
    }

    @Test
    void echoesValidRequestIdAndRejectsHeaderProblems() throws Exception {
        String deviceId = newDeviceId();
        String requestId = UUID.randomUUID().toString();

        MvcResult ok = mockMvc.perform(post("/api/v1/devices/init")
                        .header("X-Device-Id", deviceId)
                        .header("X-Request-Id", requestId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"platform\":\"H5\"}"))
                .andReturn();
        assertThat(ok.getResponse().getStatus()).isEqualTo(200);
        assertThat(ok.getResponse().getHeader("X-Request-Id")).isEqualTo(requestId);
        assertThat(body(ok).path("requestId").asText()).isEqualTo(requestId);

        assertError(getJson("/api/v1/babies", null), 400, "DEVICE_ID_REQUIRED");
        assertError(getJson("/api/v1/babies", "not-a-uuid"), 400, "DEVICE_ID_INVALID");
        // Uppercase UUIDs are invalid, never normalised (Q-13).
        assertError(getJson("/api/v1/babies", deviceId.toUpperCase(Locale.ROOT)),
                400, "DEVICE_ID_INVALID");
        assertError(getJson("/api/v1/babies", newDeviceId()), 409, "DEVICE_NOT_REGISTERED");
        assertError(postJson("/api/v1/devices/init", null, Map.of("platform", "H5")),
                400, "DEVICE_ID_REQUIRED");
        assertError(postJson("/api/v1/devices/init", "12345", Map.of("platform", "H5")),
                400, "DEVICE_ID_INVALID");
        assertError(postJson("/api/v1/devices/init", deviceId.toUpperCase(Locale.ROOT),
                Map.of("platform", "H5")), 400, "DEVICE_ID_INVALID");
    }

    @Test
    void initValidatesPlatform() throws Exception {
        String deviceId = newDeviceId();

        MvcResult invalid = postJson("/api/v1/devices/init", deviceId,
                Map.of("platform", "IOS"));
        assertError(invalid, 400, "VALIDATION_ERROR");
        assertThat(body(invalid).path("data").path("fieldErrors").get(0).path("field").asText())
                .isEqualTo("platform");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device", Integer.class)).isZero();

        // platform omitted: valid and defaults to H5.
        MvcResult defaults = postJson("/api/v1/devices/init", deviceId,
                Map.of("appVersion", "1.0.0"));
        assertThat(defaults.getResponse().getStatus()).isEqualTo(200);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT platform FROM device", String.class)).isEqualTo("H5");
    }

    @Test
    void deviceIsCachedThenDisabledIsRejected() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        assertThat(getJson("/api/v1/babies", deviceId).getResponse().getStatus()).isEqualTo(200);
        assertThat(stringRedisTemplate.hasKey(deviceCacheKey(deviceId))).isTrue();

        jdbcTemplate.update("UPDATE device SET status = 'DISABLED'");
        stringRedisTemplate.delete(deviceCacheKey(deviceId));

        assertError(getJson("/api/v1/babies", deviceId), 403, "DEVICE_DISABLED");

        // DEV-06: a disabled device cannot re-initialise itself. init is exempt
        // from the device interceptor, so the service itself must refuse and
        // must not refresh the row (last_seen_at/app_version) behind it.
        LocalDateTime lastSeen = jdbcTemplate.queryForObject(
                "SELECT last_seen_at FROM device", LocalDateTime.class);
        assertError(postJson("/api/v1/devices/init", deviceId,
                Map.of("platform", "H5", "appVersion", "9.9.9")), 403, "DEVICE_DISABLED");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT status FROM device", String.class)).isEqualTo("DISABLED");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT last_seen_at FROM device", LocalDateTime.class)).isEqualTo(lastSeen);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT app_version FROM device", String.class)).isEqualTo("1.0.0");
    }
}
