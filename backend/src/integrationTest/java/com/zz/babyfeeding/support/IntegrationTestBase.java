package com.zz.babyfeeding.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.security.DeviceIdHasher;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.nio.charset.StandardCharsets;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/**
 * Shared infrastructure for MockMvc integration tests. Each test starts from an
 * empty zz_test schema and a flushed Redis DB 15 (enforced by
 * {@link TestEnvironmentGuard}).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class IntegrationTestBase {

    private static final String[] TABLES = {
            "growth_record", "feeding_record", "family_member",
            "baby", "family", "device", "app_user"
    };

    @Autowired
    protected MockMvc mockMvc;
    @Autowired
    protected ObjectMapper objectMapper;
    @Autowired
    protected JdbcTemplate jdbcTemplate;
    @Autowired
    protected StringRedisTemplate stringRedisTemplate;
    @Autowired
    protected RedisConnectionFactory redisConnectionFactory;
    @Autowired
    protected DeviceIdHasher deviceIdHasher;
    @Autowired
    protected RedisKeys redisKeys;

    @BeforeEach
    void resetState() {
        jdbcTemplate.execute((ConnectionCallback<Void>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET FOREIGN_KEY_CHECKS = 0");
                for (String table : TABLES) {
                    statement.execute("TRUNCATE TABLE " + table);
                }
                statement.execute("SET FOREIGN_KEY_CHECKS = 1");
            }
            return null;
        });
        try (RedisConnection connection = redisConnectionFactory.getConnection()) {
            connection.serverCommands().flushDb();
        }
    }

    // ------------------------------------------------------------------ HTTP

    protected MvcResult getJson(String path, String deviceId) throws Exception {
        return mockMvc.perform(withDevice(get(path), deviceId)).andReturn();
    }

    protected MvcResult postJson(String path, String deviceId, Object payload) throws Exception {
        return mockMvc.perform(withDevice(post(path), deviceId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andReturn();
    }

    protected MvcResult patchJson(String path, String deviceId, Object payload) throws Exception {
        return mockMvc.perform(withDevice(patch(path), deviceId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andReturn();
    }

    protected MvcResult deleteJson(String path, String deviceId) throws Exception {
        return mockMvc.perform(withDevice(delete(path), deviceId)).andReturn();
    }

    private static MockHttpServletRequestBuilder withDevice(MockHttpServletRequestBuilder builder,
                                                            String deviceId) {
        if (deviceId != null) {
            builder.header("X-Device-Id", deviceId);
        }
        return builder;
    }

    protected JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(
                result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    protected void assertError(MvcResult result, int httpStatus, String code) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(httpStatus);
        JsonNode root = body(result);
        assertThat(root.path("code").asText()).isEqualTo(code);
        assertThat(root.path("message").asText()).isNotBlank();
        assertThat(root.path("requestId").asText()).isNotBlank();
        assertThat(root.path("serverTime").asText()).endsWith("Z");
    }

    // --------------------------------------------------------------- helpers

    protected String newDeviceId() {
        return UUID.randomUUID().toString();
    }

    protected MvcResult initDevice(String deviceId) throws Exception {
        return postJson("/api/v1/devices/init", deviceId,
                Map.of("platform", "H5", "appVersion", "1.0.0"));
    }

    protected JsonNode initDeviceOk(String deviceId) throws Exception {
        MvcResult result = initDevice(deviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result);
    }

    protected Map<String, Object> babyPayload(String name, Boolean isDefault) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("name", name);
        payload.put("birthDate",
                LocalDate.now(ZoneOffset.UTC).minusMonths(6).toString());
        if (isDefault != null) {
            payload.put("isDefault", isDefault);
        }
        return payload;
    }

    protected JsonNode createBaby(String deviceId, String name, Boolean isDefault)
            throws Exception {
        MvcResult result = postJson("/api/v1/babies", deviceId, babyPayload(name, isDefault));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result).path("data").path("baby");
    }

    protected long deviceRowId(String deviceId) {
        Long id = jdbcTemplate.queryForObject(
                "SELECT id FROM device WHERE device_uid_hash = ?",
                Long.class, (Object) deviceIdHasher.hash(deviceId));
        assertThat(id).isNotNull();
        return id;
    }

    protected String deviceCacheKey(String deviceId) {
        return redisKeys.device(deviceIdHasher.hashHex(deviceId));
    }

    protected String babyCacheKey(String deviceId, String babyId) {
        return redisKeys.baby(deviceIdHasher.hashHex(deviceId), babyId);
    }
}
