package com.zz.babyfeeding.baby;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BabyIntegrationTest extends IntegrationTestBase {

    @Test
    void crudAndOptimisticConcurrency() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        MvcResult create = postJson("/api/v1/babies", deviceId, babyPayload(" 小满 ", true));
        assertThat(create.getResponse().getStatus()).isEqualTo(200);
        JsonNode createBody = body(create);
        assertThat(createBody.path("data").path("created").asBoolean()).isTrue();
        JsonNode baby = createBody.path("data").path("baby");
        String babyId = baby.path("id").asText();
        assertThat(babyId).matches("[0-9a-f-]{36}");
        assertThat(baby.path("name").asText()).isEqualTo("小满");
        assertThat(baby.path("gender").asText()).isEqualTo("UNKNOWN");
        assertThat(baby.path("isDefault").asBoolean()).isTrue();
        assertThat(baby.path("revision").asInt()).isEqualTo(1);
        assertThat(baby.path("createdAt").asText()).endsWith("Z");

        MvcResult list = getJson("/api/v1/babies", deviceId);
        assertThat(body(list).path("data")).hasSize(1);
        assertThat(body(getJson("/api/v1/babies/" + babyId, deviceId)).path("data")
                .path("name").asText()).isEqualTo("小满");

        MvcResult patch = patchJson("/api/v1/babies/" + babyId, deviceId,
                Map.of("baseRevision", 1, "name", "小满满", "gender", "FEMALE"));
        assertThat(patch.getResponse().getStatus()).isEqualTo(200);
        JsonNode patched = body(patch).path("data");
        assertThat(patched.path("name").asText()).isEqualTo("小满满");
        assertThat(patched.path("gender").asText()).isEqualTo("FEMALE");
        assertThat(patched.path("revision").asInt()).isEqualTo(2);

        MvcResult stalePatch = patchJson("/api/v1/babies/" + babyId, deviceId,
                Map.of("baseRevision", 1, "name", "过期写入"));
        assertError(stalePatch, 409, "CONFLICT");
        assertThat(body(stalePatch).path("data").path("current").path("revision").asInt())
                .isEqualTo(2);
        assertThat(body(stalePatch).path("data").path("current").path("name").asText())
                .isEqualTo("小满满");

        assertError(deleteJson("/api/v1/babies/" + babyId + "?baseRevision=1", deviceId),
                409, "CONFLICT");

        MvcResult delete = deleteJson("/api/v1/babies/" + babyId + "?baseRevision=2", deviceId);
        assertThat(delete.getResponse().getStatus()).isEqualTo(200);
        JsonNode deleted = body(delete).path("data");
        assertThat(deleted.path("alreadyDeleted").asBoolean()).isFalse();
        assertThat(deleted.path("revision").asInt()).isEqualTo(3);
        assertThat(deleted.path("deletedAt").asText()).endsWith("Z");
        assertThat(deleted.path("cascadedFeedingRecords").asInt()).isZero();
        assertThat(deleted.path("cascadedGrowthRecords").asInt()).isZero();

        MvcResult repeatDelete =
                deleteJson("/api/v1/babies/" + babyId + "?baseRevision=1", deviceId);
        assertThat(repeatDelete.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(repeatDelete).path("data").path("alreadyDeleted").asBoolean()).isTrue();
        assertThat(body(repeatDelete).path("data").path("revision").asInt()).isEqualTo(3);

        assertError(getJson("/api/v1/babies/" + babyId, deviceId), 404, "NOT_FOUND");
        assertThat(body(getJson("/api/v1/babies", deviceId)).path("data")).isEmpty();
    }

    @Test
    void createIsIdempotentById() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        String id = UUID.randomUUID().toString();

        Map<String, Object> payload = babyPayload("小满", true);
        payload.put("id", id);
        JsonNode first = body(postJson("/api/v1/babies", deviceId, payload));
        assertThat(first.path("data").path("created").asBoolean()).isTrue();
        assertThat(first.path("data").path("baby").path("id").asText()).isEqualTo(id);

        JsonNode second = body(postJson("/api/v1/babies", deviceId, payload));
        assertThat(second.path("data").path("created").asBoolean()).isFalse();
        assertThat(second.path("data").path("baby").path("revision").asInt()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM baby", Integer.class)).isEqualTo(1);

        deleteJson("/api/v1/babies/" + id + "?baseRevision=1", deviceId);
        JsonNode afterDelete = body(postJson("/api/v1/babies", deviceId, payload));
        assertThat(afterDelete.path("data").path("created").asBoolean()).isFalse();
        assertThat(afterDelete.path("data").path("baby").path("deletedAt").asText())
                .endsWith("Z");
    }

    @Test
    void maxFiveBabiesAndDefaultTransitions() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);

        JsonNode baby1 = createBaby(deviceId, "宝宝1", null);
        assertThat(baby1.path("isDefault").asBoolean()).isTrue();
        JsonNode baby2 = createBaby(deviceId, "宝宝2", false);
        JsonNode baby3 = createBaby(deviceId, "宝宝3", false);
        createBaby(deviceId, "宝宝4", false);
        createBaby(deviceId, "宝宝5", false);
        assertThat(baby2.path("isDefault").asBoolean()).isFalse();
        assertThat(baby3.path("revision").asInt()).isEqualTo(1);

        assertError(postJson("/api/v1/babies", deviceId, babyPayload("宝宝6", false)),
                400, "BABY_LIMIT_EXCEEDED");

        String baby3Id = baby3.path("id").asText();
        MvcResult switchDefault = patchJson("/api/v1/babies/" + baby3Id, deviceId,
                Map.of("baseRevision", 1, "isDefault", true));
        assertThat(switchDefault.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(switchDefault).path("data").path("isDefault").asBoolean()).isTrue();
        assertThat(body(switchDefault).path("data").path("revision").asInt()).isEqualTo(2);

        JsonNode list = body(getJson("/api/v1/babies", deviceId)).path("data");
        assertThat(list).hasSize(5);
        assertThat(list.get(0).path("id").asText()).isEqualTo(baby3Id);
        JsonNode oldDefault = findById(list, baby1.path("id").asText());
        assertThat(oldDefault.path("isDefault").asBoolean()).isFalse();
        assertThat(oldDefault.path("revision").asInt()).isEqualTo(2);

        assertError(patchJson("/api/v1/babies/" + baby3Id, deviceId,
                Map.of("baseRevision", 2, "isDefault", false)), 400, "DEFAULT_BABY_REQUIRED");
    }

    @Test
    void deleteCascadesAndPromotesDefault() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        JsonNode baby1 = createBaby(deviceId, "大宝", null);
        JsonNode baby2 = createBaby(deviceId, "二宝", false);
        assertThat(baby1.path("isDefault").asBoolean()).isTrue();

        String baby1Id = baby1.path("id").asText();
        long deviceRowId = deviceRowId(deviceId);
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        LocalDate today = LocalDate.now(ZoneOffset.UTC);

        String activeFeedingId = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                        INSERT INTO feeding_record
                            (id, device_id, baby_id, feed_type, breast_side, duration_sec,
                             started_at, tz_offset_minutes, record_date)
                        VALUES (?, ?, ?, 'BREAST', 'LEFT', 600, ?, 480, ?)
                        """,
                activeFeedingId, deviceRowId, baby1Id, now, today);
        jdbcTemplate.update("""
                        INSERT INTO feeding_record
                            (id, device_id, baby_id, feed_type, started_at, tz_offset_minutes,
                             record_date, deleted_at)
                        VALUES (?, ?, ?, 'BOTTLE', ?, 480, ?, ?)
                        """,
                UUID.randomUUID().toString(), deviceRowId, baby1Id, now, today, now);
        String growthId = UUID.randomUUID().toString();
        jdbcTemplate.update("""
                        INSERT INTO growth_record
                            (id, device_id, baby_id, measured_on, height_cm, weight_kg)
                        VALUES (?, ?, ?, ?, 68.5, 8.2)
                        """,
                growthId, deviceRowId, baby1Id, today);

        MvcResult delete = deleteJson("/api/v1/babies/" + baby1Id + "?baseRevision=1", deviceId);
        assertThat(delete.getResponse().getStatus()).isEqualTo(200);
        JsonNode deleted = body(delete).path("data");
        assertThat(deleted.path("cascadedFeedingRecords").asInt()).isEqualTo(1);
        assertThat(deleted.path("cascadedGrowthRecords").asInt()).isEqualTo(1);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record WHERE deleted_at IS NULL", Integer.class))
                .isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record", Integer.class)).isEqualTo(2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM growth_record WHERE deleted_at IS NULL", Integer.class))
                .isZero();

        String baby2Id = baby2.path("id").asText();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT is_default + 0 FROM baby WHERE id = ?", Integer.class, baby2Id))
                .isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT revision FROM baby WHERE id = ?", Integer.class, baby2Id))
                .isEqualTo(2);

        assertThat(stringRedisTemplate.hasKey(
                redisKeys.statsVersion(deviceIdHasher.hashHex(deviceId), baby1Id))).isTrue();

        MvcResult repeatDelete =
                deleteJson("/api/v1/babies/" + baby1Id + "?baseRevision=2", deviceId);
        assertThat(body(repeatDelete).path("data").path("alreadyDeleted").asBoolean()).isTrue();
        assertThat(body(repeatDelete).path("data").path("cascadedFeedingRecords").asInt())
                .isZero();
    }

    @Test
    void crossDeviceIsolation() throws Exception {
        String deviceA = newDeviceId();
        String deviceB = newDeviceId();
        initDeviceOk(deviceA);
        initDeviceOk(deviceB);

        JsonNode babyA = createBaby(deviceA, "只属于A", true);
        String babyAId = babyA.path("id").asText();

        assertError(getJson("/api/v1/babies/" + babyAId, deviceB), 404, "NOT_FOUND");
        assertError(patchJson("/api/v1/babies/" + babyAId, deviceB,
                Map.of("baseRevision", 1, "name", "越权改名")), 404, "NOT_FOUND");
        assertError(deleteJson("/api/v1/babies/" + babyAId + "?baseRevision=1", deviceB),
                404, "NOT_FOUND");

        Map<String, Object> collision = babyPayload("冲突", true);
        collision.put("id", babyAId);
        assertError(postJson("/api/v1/babies", deviceB, collision), 404, "NOT_FOUND");

        assertThat(body(getJson("/api/v1/babies", deviceB)).path("data")).isEmpty();
        assertThat(body(getJson("/api/v1/babies", deviceA)).path("data")).hasSize(1);
        assertThat(body(getJson("/api/v1/babies/" + babyAId, deviceA))
                .path("data").path("name").asText()).isEqualTo("只属于A");
    }

    @Test
    void validationErrors() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        JsonNode baby = createBaby(deviceId, "小满", true);
        String babyId = baby.path("id").asText();

        assertFieldError(postJson("/api/v1/babies", deviceId, babyPayload("   ", null)), "name");
        assertFieldError(postJson("/api/v1/babies", deviceId,
                babyPayload("a".repeat(21), null)), "name");

        Map<String, Object> badGender = babyPayload("小满", null);
        badGender.put("gender", "X");
        assertFieldError(postJson("/api/v1/babies", deviceId, badGender), "gender");

        Map<String, Object> future = babyPayload("小满", null);
        future.put("birthDate", LocalDate.now(ZoneOffset.UTC).plusDays(1).toString());
        assertFieldError(postJson("/api/v1/babies", deviceId, future), "birthDate");

        Map<String, Object> tooOld = babyPayload("小满", null);
        tooOld.put("birthDate", LocalDate.now(ZoneOffset.UTC).minusYears(3).minusDays(1).toString());
        assertFieldError(postJson("/api/v1/babies", deviceId, tooOld), "birthDate");

        Map<String, Object> missingBirthDate = babyPayload("小满", null);
        missingBirthDate.remove("birthDate");
        assertFieldError(postJson("/api/v1/babies", deviceId, missingBirthDate), "birthDate");

        assertFieldError(patchJson("/api/v1/babies/" + babyId, deviceId,
                Map.of("name", "缺版本号")), "baseRevision");
        assertFieldError(deleteJson("/api/v1/babies/" + babyId, deviceId), "baseRevision");
        assertError(getJson("/api/v1/babies/" + UUID.randomUUID(), deviceId),
                404, "NOT_FOUND");

        assertThat(body(getJson("/api/v1/babies", deviceId)).path("data")).hasSize(1);
    }

    @Test
    void cacheIsInvalidatedOnWrites() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        JsonNode baby = createBaby(deviceId, "小满", true);
        String babyId = baby.path("id").asText();
        String cacheKey = babyCacheKey(deviceId, babyId);

        getJson("/api/v1/babies/" + babyId, deviceId);
        assertThat(stringRedisTemplate.hasKey(cacheKey)).isTrue();

        patchJson("/api/v1/babies/" + babyId, deviceId,
                Map.of("baseRevision", 1, "name", "小满满"));
        assertThat(stringRedisTemplate.hasKey(cacheKey)).isFalse();

        getJson("/api/v1/babies/" + babyId, deviceId);
        assertThat(stringRedisTemplate.hasKey(cacheKey)).isTrue();

        deleteJson("/api/v1/babies/" + babyId + "?baseRevision=2", deviceId);
        assertThat(stringRedisTemplate.hasKey(cacheKey)).isFalse();
    }

    private static JsonNode findById(JsonNode array, String id) {
        for (JsonNode item : array) {
            if (id.equals(item.path("id").asText())) {
                return item;
            }
        }
        throw new AssertionError("baby not found in list: " + id);
    }

    private void assertFieldError(MvcResult result, String field) throws Exception {
        assertError(result, 400, "VALIDATION_ERROR");
        JsonNode fieldErrors = body(result).path("data").path("fieldErrors");
        assertThat(fieldErrors).isNotEmpty();
        assertThat(fieldErrors.get(0).path("field").asText()).isEqualTo(field);
    }
}
