package com.zz.babyfeeding.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Executable SYNC-01..SYNC-17 acceptance cases (docs/tests §13) plus the
 * baby-delete cascade through sync. Every batch is a fresh device/Redis state
 * thanks to IntegrationTestBase.
 */
class SyncIntegrationTest extends IntegrationTestBase {

    private static final String BIRTH_DATE = "2026-03-01";
    private static final String STARTED_AT = "2026-10-20T08:00:00+08:00";
    private static final Object OMIT = new Object();

    // ---------------------------------------------------------------- helpers

    private static Map<String, Object> payload(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index < keyValues.length; index += 2) {
            map.put((String) keyValues[index], keyValues[index + 1]);
        }
        return map;
    }

    private static Map<String, Object> merge(Map<String, Object> base, Object... overrides) {
        for (int index = 0; index < overrides.length; index += 2) {
            String key = (String) overrides[index];
            Object value = overrides[index + 1];
            if (value == OMIT) {
                base.remove(key);
            } else {
                base.put(key, value);
            }
        }
        return base;
    }

    private Map<String, Object> babyChange(String id, int baseRevision, Object... overrides) {
        Map<String, Object> data = merge(payload(
                "name", "同步宝宝",
                "gender", "FEMALE",
                "birthDate", BIRTH_DATE,
                "isDefault", false), overrides);
        return payload("entityType", "BABY", "op", "UPSERT",
                "id", id, "baseRevision", baseRevision, "data", data);
    }

    private Map<String, Object> feedingChange(String id, String babyId, int baseRevision,
                                              Object... overrides) {
        Map<String, Object> data = merge(payload(
                "babyId", babyId,
                "feedType", "FORMULA",
                "amountValue", 120,
                "amountUnit", "ML",
                "startedAt", STARTED_AT), overrides);
        return payload("entityType", "FEEDING_RECORD", "op", "UPSERT",
                "id", id, "baseRevision", baseRevision, "data", data);
    }

    private Map<String, Object> deleteChange(String entityType, String id, int baseRevision) {
        return payload("entityType", entityType, "op", "DELETE",
                "id", id, "baseRevision", baseRevision);
    }

    private static Map<String, Object> batch(List<Map<String, Object>> changes) {
        return batch(UUID.randomUUID().toString(), changes);
    }

    private static Map<String, Object> batch(String batchId,
                                             List<Map<String, Object>> changes) {
        return payload("batchId", batchId,
                "clientTime", "2026-10-26T16:00:00+08:00",
                "changes", changes);
    }

    private JsonNode push(String deviceId, Map<String, Object> body) throws Exception {
        MvcResult result = postJson("/api/v1/sync/push", deviceId, body);
        assertThat(result.getResponse().getStatus())
                .as("sync response=%s",
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data");
    }

    private String setupDevice(String deviceId) throws Exception {
        initDeviceOk(deviceId);
        return deviceId;
    }

    private String setupBaby(String deviceId) throws Exception {
        initDeviceOk(deviceId);
        MvcResult result = postJson("/api/v1/babies", deviceId, payload(
                "name", "小满",
                "gender", "FEMALE",
                "birthDate", BIRTH_DATE));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result).path("data").path("baby").path("id").asText();
    }

    private JsonNode createFeedingOnline(String deviceId, String babyId,
                                         Object... overrides) throws Exception {
        Map<String, Object> body = merge(payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "FORMULA",
                "amountValue", 120,
                "amountUnit", "ML",
                "startedAt", STARTED_AT), overrides);
        MvcResult result = postJson("/api/v1/feeding-records", deviceId, body);
        assertThat(result.getResponse().getStatus())
                .as("create feeding body=%s response=%s", body,
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data").path("record");
    }

    private JsonNode syncResult(JsonNode data, int index) {
        return data.path("results").get(index);
    }

    private static String status(JsonNode result) {
        return result.path("status").asText();
    }

    private static int revision(JsonNode result) {
        return result.path("revision").asInt();
    }

    private static JsonNode record(JsonNode result) {
        return result.path("record");
    }

    // ------------------------------------------------------------ SYNC-01..03

    @Test
    void batchCreatesBabyAndFeedingInRequestOrder() throws Exception {
        String deviceId = newDeviceId();
        setupDevice(deviceId);
        String babyId = UUID.randomUUID().toString();
        String feedingId = UUID.randomUUID().toString();
        Map<String, Object> body = batch(List.of(
                babyChange(babyId, 0, "name", "同步宝宝", "isDefault", true),
                feedingChange(feedingId, babyId, 0)));

        JsonNode data = push(deviceId, body);

        assertThat(data.path("batchId").asText()).isEqualTo(body.get("batchId"));
        assertThat(data.path("replayed").asBoolean()).isFalse();
        assertThat(data.path("processedAt").asText()).endsWith("Z");
        assertThat(data.path("results")).hasSize(2);
        assertThat(status(syncResult(data, 0))).isEqualTo("APPLIED");
        assertThat(status(syncResult(data, 1))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(data, 0))).isEqualTo(1);
        assertThat(revision(syncResult(data, 1))).isEqualTo(1);
        assertThat(data.path("summary").path("applied").asInt()).isEqualTo(2);
        assertThat(data.path("summary").path("rejected").asInt()).isZero();

        JsonNode baby = body(getJson("/api/v1/babies/" + babyId, deviceId))
                .path("data");
        assertThat(baby.path("revision").asInt()).isEqualTo(1);
        JsonNode feeding = body(getJson("/api/v1/feeding-records/" + feedingId, deviceId))
                .path("data");
        assertThat(feeding.path("revision").asInt()).isEqualTo(1);
        assertThat(feeding.path("amountValue").asInt()).isEqualTo(120);
    }

    @Test
    void replayOfSameBatchIdReturnsCachedResponse() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String feedingId = UUID.randomUUID().toString();
        Map<String, Object> body = batch(List.of(feedingChange(feedingId, babyId, 0)));

        JsonNode first = push(deviceId, body);
        JsonNode replay = push(deviceId, body);

        assertThat(first.path("replayed").asBoolean()).isFalse();
        assertThat(replay.path("replayed").asBoolean()).isTrue();
        assertThat(replay.path("summary")).isEqualTo(first.path("summary"));
        assertThat(replay.path("results")).isEqualTo(first.path("results"));

        MvcResult list = getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20", deviceId);
        assertThat(body(list).path("data").path("total").asInt()).isEqualTo(1);
    }

    @Test
    void sameBatchIdWithDifferentBodyIsRejected() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String feedingId = UUID.randomUUID().toString();
        String batchId = UUID.randomUUID().toString();

        push(deviceId, batch(batchId,
                List.of(feedingChange(feedingId, babyId, 0))));

        MvcResult conflict = postJson("/api/v1/sync/push", deviceId,
                batch(batchId, List.of(
                        feedingChange(feedingId, babyId, 0, "amountValue", 150))));
        assertError(conflict, 409, "CONFLICT");

        JsonNode record = body(getJson("/api/v1/feeding-records/" + feedingId, deviceId))
                .path("data");
        assertThat(record.path("amountValue").asInt()).isEqualTo(120);
    }

    // ------------------------------------------------------------ SYNC-04..09

    @Test
    void upsertWithZeroRevisionReturnsExistingRecord() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId,
                "amountValue", 120).path("id").asText();

        JsonNode data = push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 0, "amountValue", 999))));

        assertThat(status(syncResult(data, 0))).isEqualTo("DUPLICATE");
        assertThat(revision(syncResult(data, 0))).isEqualTo(1);
        assertThat(record(syncResult(data, 0)).path("amountValue").asInt()).isEqualTo(120);
        assertThat(data.path("summary").path("duplicate").asInt()).isEqualTo(1);
    }

    @Test
    void upsertWithMatchingRevisionAppliesAndBumpsRevision() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId,
                "amountValue", 120).path("id").asText();

        JsonNode data = push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 1, "amountValue", 150))));

        assertThat(status(syncResult(data, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(data, 0))).isEqualTo(2);
        assertThat(data.path("summary").path("applied").asInt()).isEqualTo(1);

        JsonNode fetched = body(getJson("/api/v1/feeding-records/" + recordId, deviceId))
                .path("data");
        assertThat(fetched.path("amountValue").asInt()).isEqualTo(150);
        assertThat(fetched.path("revision").asInt()).isEqualTo(2);
    }

    @Test
    void upsertWithStaleRevisionLetsServerWin() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId,
                "amountValue", 120).path("id").asText();

        push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 1, "amountValue", 150))));

        JsonNode data = push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 1, "amountValue", 999))));

        assertThat(status(syncResult(data, 0))).isEqualTo("CONFLICT_SERVER_WINS");
        assertThat(revision(syncResult(data, 0))).isEqualTo(2);
        assertThat(record(syncResult(data, 0)).path("amountValue").asInt()).isEqualTo(150);
        assertThat(data.path("summary").path("conflict").asInt()).isEqualTo(1);

        JsonNode fetched = body(getJson("/api/v1/feeding-records/" + recordId, deviceId))
                .path("data");
        assertThat(fetched.path("amountValue").asInt()).isEqualTo(150);
    }

    @Test
    void deleteOfMissingRecordIsDuplicate() throws Exception {
        String deviceId = newDeviceId();
        setupBaby(deviceId);
        String missingId = UUID.randomUUID().toString();

        JsonNode data = push(deviceId, batch(List.of(
                deleteChange("FEEDING_RECORD", missingId, 1))));

        assertThat(status(syncResult(data, 0))).isEqualTo("DUPLICATE");
        assertThat(data.path("summary").path("duplicate").asInt()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record WHERE id = ?", Integer.class, missingId))
                .isZero();
    }

    @Test
    void deleteWithMatchingRevisionSoftDeletesAndReturnsTombstone() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId).path("id").asText();

        JsonNode data = push(deviceId, batch(List.of(
                deleteChange("FEEDING_RECORD", recordId, 1))));

        assertThat(status(syncResult(data, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(data, 0))).isEqualTo(2);
        assertThat(record(syncResult(data, 0)).path("deletedAt").asText()).isNotBlank();

        assertError(getJson("/api/v1/feeding-records/" + recordId, deviceId),
                404, "NOT_FOUND");
        JsonNode list = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20", deviceId)).path("data");
        assertThat(list.path("total").asInt()).isZero();
    }

    @Test
    void deleteWithStaleRevisionLetsServerWin() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId).path("id").asText();

        JsonNode data = push(deviceId, batch(List.of(
                deleteChange("FEEDING_RECORD", recordId, 99))));

        assertThat(status(syncResult(data, 0))).isEqualTo("CONFLICT_SERVER_WINS");
        assertThat(revision(syncResult(data, 0))).isEqualTo(1);

        JsonNode fetched = body(getJson("/api/v1/feeding-records/" + recordId, deviceId))
                .path("data");
        assertThat(fetched.path("deletedAt").isNull()).isTrue();
        assertThat(fetched.path("revision").asInt()).isEqualTo(1);
    }

    // ----------------------------------------------------------- SYNC-10..14

    @Test
    void invisibleBabyRejectsOnlyThatItem() throws Exception {
        String deviceId = newDeviceId();
        setupDevice(deviceId);
        String otherDevice = newDeviceId();
        String otherBaby = setupBaby(otherDevice);

        String babyId = UUID.randomUUID().toString();
        String feedingId = UUID.randomUUID().toString();
        JsonNode ordered = push(deviceId, batch(List.of(
                feedingChange(feedingId, babyId, 0),
                babyChange(babyId, 0, "name", "迟到宝宝"))));

        assertThat(status(syncResult(ordered, 0))).isEqualTo("REJECTED");
        assertThat(syncResult(ordered, 0).path("error").path("code").asText())
                .isEqualTo("NOT_FOUND");
        assertThat(fieldNames(syncResult(ordered, 0).path("error")))
                .containsExactly("code", "message");
        assertThat(status(syncResult(ordered, 1))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(ordered, 1))).isEqualTo(1);
        assertThat(ordered.path("summary").path("applied").asInt()).isOne();
        assertThat(ordered.path("summary").path("rejected").asInt()).isOne();

        JsonNode missingBaby = push(deviceId, batch(List.of(
                feedingChange(UUID.randomUUID().toString(),
                        UUID.randomUUID().toString(), 0))));
        assertThat(status(syncResult(missingBaby, 0))).isEqualTo("REJECTED");

        JsonNode deletedBaby = createBaby(deviceId, "待删除", null);
        String deletedBabyId = deletedBaby.path("id").asText();
        assertThat(deleteJson("/api/v1/babies/" + deletedBabyId
                + "?baseRevision=1", deviceId).getResponse().getStatus()).isEqualTo(200);
        JsonNode deletedRef = push(deviceId, batch(List.of(
                feedingChange(UUID.randomUUID().toString(), deletedBabyId, 0))));
        assertThat(status(syncResult(deletedRef, 0))).isEqualTo("REJECTED");

        JsonNode crossDevice = push(deviceId, batch(List.of(
                feedingChange(UUID.randomUUID().toString(), otherBaby, 0))));
        assertThat(status(syncResult(crossDevice, 0))).isEqualTo("REJECTED");

        JsonNode referenceError = syncResult(missingBaby, 0).path("error");
        assertThat(syncResult(deletedRef, 0).path("error")).isEqualTo(referenceError);
        assertThat(syncResult(crossDevice, 0).path("error")).isEqualTo(referenceError);
        assertThat(referenceError.path("code").asText()).isEqualTo("NOT_FOUND");

        JsonNode retry = push(deviceId, batch(List.of(
                feedingChange(feedingId, babyId, 0))));
        assertThat(status(syncResult(retry, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(retry, 0))).isEqualTo(1);
    }

    private static List<String> fieldNames(JsonNode node) {
        List<String> names = new ArrayList<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    @Test
    void invalidItemDoesNotBlockOtherItems() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String newBabyId = UUID.randomUUID().toString();
        String invalidId = UUID.randomUUID().toString();
        String validId = UUID.randomUUID().toString();

        JsonNode data = push(deviceId, batch(List.of(
                babyChange(newBabyId, 0),
                feedingChange(invalidId, babyId, 0, "amountValue", OMIT),
                feedingChange(validId, babyId, 0))));

        assertThat(status(syncResult(data, 0))).isEqualTo("APPLIED");
        assertThat(status(syncResult(data, 1))).isEqualTo("REJECTED");
        assertThat(status(syncResult(data, 2))).isEqualTo("APPLIED");
        assertThat(syncResult(data, 1).path("error").path("code").asText())
                .isEqualTo("VALIDATION_ERROR");
        assertThat(data.path("summary").path("applied").asInt()).isEqualTo(2);
        assertThat(data.path("summary").path("rejected").asInt()).isEqualTo(1);

        assertError(getJson("/api/v1/feeding-records/" + invalidId, deviceId),
                404, "NOT_FOUND");
        assertThat(getJson("/api/v1/feeding-records/" + validId, deviceId)
                .getResponse().getStatus()).isEqualTo(200);
    }

    @Test
    void duplicateEntityAndIdInBatchIsBatchLevelError() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String id = UUID.randomUUID().toString();

        MvcResult result = postJson("/api/v1/sync/push", deviceId, batch(List.of(
                feedingChange(id, babyId, 0),
                feedingChange(id, babyId, 0, "amountValue", 150))));

        assertError(result, 400, "VALIDATION_ERROR");
        assertError(getJson("/api/v1/feeding-records/" + id, deviceId),
                404, "NOT_FOUND");
    }

    @Test
    void batchSizeAndBatchIdAreValidated() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);

        assertError(postJson("/api/v1/sync/push", deviceId, batch(List.of())),
                400, "VALIDATION_ERROR");

        List<Map<String, Object>> fiftyOne = new ArrayList<>();
        for (int index = 0; index < 51; index++) {
            fiftyOne.add(feedingChange(UUID.randomUUID().toString(), babyId, 0));
        }
        assertError(postJson("/api/v1/sync/push", deviceId, batch(fiftyOne)),
                400, "VALIDATION_ERROR");

        List<Map<String, Object>> fifty = new ArrayList<>();
        for (int index = 0; index < 50; index++) {
            fifty.add(feedingChange(UUID.randomUUID().toString(), babyId, 0));
        }
        JsonNode ok = push(deviceId, batch(fifty));
        assertThat(ok.path("summary").path("applied").asInt()).isEqualTo(50);

        Map<String, Object> noBatchId = batch(List.of(
                feedingChange(UUID.randomUUID().toString(), babyId, 0)));
        noBatchId.remove("batchId");
        assertError(postJson("/api/v1/sync/push", deviceId, noBatchId),
                400, "VALIDATION_ERROR");

        Map<String, Object> badBatchId = batch(List.of(
                feedingChange(UUID.randomUUID().toString(), babyId, 0)));
        badBatchId.put("batchId", "not-uuid");
        assertError(postJson("/api/v1/sync/push", deviceId, badBatchId),
                400, "VALIDATION_ERROR");
    }

    @Test
    void crossDeviceIdsCannotBeModified() throws Exception {
        String deviceId = newDeviceId();
        setupDevice(deviceId);
        String otherDevice = newDeviceId();
        String otherBaby = setupBaby(otherDevice);
        JsonNode otherFeeding = createFeedingOnline(otherDevice, otherBaby);

        JsonNode data = push(deviceId, batch(List.of(
                babyChange(otherBaby, 0, "name", "越权改名"),
                feedingChange(otherFeeding.path("id").asText(), otherBaby, 0,
                        "amountValue", 999))));

        assertThat(data.path("results")).hasSize(2);
        assertThat(status(syncResult(data, 0))).isEqualTo("REJECTED");
        assertThat(status(syncResult(data, 1))).isEqualTo("REJECTED");
        assertThat(syncResult(data, 0).path("error").path("code").asText())
                .isEqualTo("NOT_FOUND");
        assertThat(syncResult(data, 1).path("error").path("code").asText())
                .isEqualTo("NOT_FOUND");

        JsonNode otherBabyNode = body(getJson("/api/v1/babies/" + otherBaby, otherDevice))
                .path("data");
        assertThat(otherBabyNode.path("name").asText()).isEqualTo("小满");
        assertThat(otherBabyNode.path("revision").asInt()).isEqualTo(1);
        JsonNode otherFeedingNode = body(getJson(
                "/api/v1/feeding-records/" + otherFeeding.path("id").asText(), otherDevice))
                .path("data");
        assertThat(otherFeedingNode.path("amountValue").asInt()).isEqualTo(120);
        assertThat(otherFeedingNode.path("revision").asInt()).isEqualTo(1);

        assertThat(body(getJson("/api/v1/babies", deviceId)).path("data")).isEmpty();
    }

    // ----------------------------------------------------------- SYNC-15..17

    @Test
    void clientTimeDoesNotAffectConflictResolution() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId,
                "amountValue", 120).path("id").asText();

        Map<String, Object> firstBatch = payload(
                "batchId", UUID.randomUUID().toString(),
                "clientTime", "2000-01-01T00:00:00+00:00",
                "changes", List.of(feedingChange(recordId, babyId, 1, "amountValue", 150)));
        JsonNode applied = push(deviceId, firstBatch);
        assertThat(status(syncResult(applied, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(applied, 0))).isEqualTo(2);

        Map<String, Object> secondBatch = payload(
                "batchId", UUID.randomUUID().toString(),
                "clientTime", "2099-01-01T00:00:00+00:00",
                "changes", List.of(feedingChange(recordId, babyId, 1, "amountValue", 999)));
        JsonNode conflict = push(deviceId, secondBatch);
        assertThat(status(syncResult(conflict, 0))).isEqualTo("CONFLICT_SERVER_WINS");
        assertThat(record(syncResult(conflict, 0)).path("amountValue").asInt())
                .isEqualTo(150);

        JsonNode fetched = body(getJson("/api/v1/feeding-records/" + recordId, deviceId))
                .path("data");
        assertThat(fetched.path("amountValue").asInt()).isEqualTo(150);
    }

    @Test
    void heldLockBlocksBatchAndReplayAfterRelease() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String hashHex = deviceIdHasher.hashHex(deviceId);
        String lockKey = redisKeys.syncLock(hashHex);
        String lockToken = UUID.randomUUID().toString();
        assertThat(stringRedisTemplate.opsForValue()
                .setIfAbsent(lockKey, lockToken, Duration.ofSeconds(15))).isTrue();
        Long ttl = stringRedisTemplate.getExpire(lockKey, TimeUnit.SECONDS);
        assertThat(ttl).isNotNull().isBetween(1L, 15L);

        String feedingId = UUID.randomUUID().toString();
        Map<String, Object> body = batch(List.of(
                feedingChange(feedingId, babyId, 0)));

        MvcResult blocked = postJson("/api/v1/sync/push", deviceId, body);
        assertError(blocked, 409, "SYNC_IN_PROGRESS");
        assertThat(blocked.getResponse().getHeader("Retry-After")).isEqualTo("1");
        assertThat(stringRedisTemplate.hasKey(lockKey)).isTrue();
        assertError(getJson("/api/v1/feeding-records/" + feedingId, deviceId),
                404, "NOT_FOUND");

        stringRedisTemplate.execute(new DefaultRedisScript<>(
                "if redis.call('GET', KEYS[1]) == ARGV[1] then "
                        + "return redis.call('DEL', KEYS[1]) end return 0", Long.class),
                List.of(lockKey), lockToken);

        JsonNode applied = push(deviceId, body);
        assertThat(applied.path("replayed").asBoolean()).isFalse();
        assertThat(status(syncResult(applied, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(applied, 0))).isEqualTo(1);

        JsonNode replay = push(deviceId, body);
        assertThat(replay.path("replayed").asBoolean()).isTrue();
        assertThat(replay.path("summary")).isEqualTo(applied.path("summary"));

        String batchKey = redisKeys.syncBatch(hashHex, body.get("batchId").toString());
        Long batchTtl = stringRedisTemplate.getExpire(batchKey, TimeUnit.SECONDS);
        assertThat(batchTtl).isNotNull().isBetween(86_390L, 86_400L);

        assertThat(body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20", deviceId)).path("data").path("total").asInt())
                .isEqualTo(1);
    }

    @Test
    void tombstonedRecordIsNeverRevived() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupBaby(deviceId);
        String recordId = createFeedingOnline(deviceId, babyId,
                "amountValue", 120).path("id").asText();
        assertThat(deleteJson("/api/v1/feeding-records/" + recordId
                + "?baseRevision=1", deviceId).getResponse().getStatus()).isEqualTo(200);

        JsonNode matching = push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 2, "amountValue", 999))));
        assertThat(status(syncResult(matching, 0))).isEqualTo("DUPLICATE");
        assertThat(matching.path("summary").path("duplicate").asInt()).isEqualTo(1);
        assertThat(record(syncResult(matching, 0)).path("deletedAt").asText()).isNotBlank();
        assertThat(revision(syncResult(matching, 0))).isEqualTo(2);
        assertThat(record(syncResult(matching, 0)).path("amountValue").asInt())
                .isEqualTo(120);

        JsonNode zero = push(deviceId, batch(List.of(
                feedingChange(recordId, babyId, 0, "amountValue", 999))));
        assertThat(status(syncResult(zero, 0))).isEqualTo("DUPLICATE");
        assertThat(record(syncResult(zero, 0)).path("deletedAt").asText()).isNotBlank();
        assertThat(revision(syncResult(zero, 0))).isEqualTo(2);

        JsonNode deleteAgain = push(deviceId, batch(List.of(
                deleteChange("FEEDING_RECORD", recordId, 2))));
        assertThat(status(syncResult(deleteAgain, 0))).isEqualTo("DUPLICATE");
        assertThat(deleteAgain.path("summary").path("duplicate").asInt()).isEqualTo(1);
        assertThat(record(syncResult(deleteAgain, 0)).path("deletedAt").asText())
                .isNotBlank();
        assertThat(revision(syncResult(deleteAgain, 0))).isEqualTo(2);

        assertError(getJson("/api/v1/feeding-records/" + recordId, deviceId),
                404, "NOT_FOUND");
        Integer revision = jdbcTemplate.queryForObject(
                "SELECT revision FROM feeding_record WHERE id = ?", Integer.class, recordId);
        Integer deleted = jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM feeding_record WHERE id = ?",
                Integer.class, recordId);
        assertThat(revision).isEqualTo(2);
        assertThat(deleted).isEqualTo(1);
    }

    // --------------------------------------------------- extra: baby cascade

    @Test
    void syncBabyDeleteCascadesRecordsAndPromotesDefault() throws Exception {
        String deviceId = newDeviceId();
        initDeviceOk(deviceId);
        JsonNode first = createBaby(deviceId, "大宝", true);
        String firstId = first.path("id").asText();
        JsonNode second = createBaby(deviceId, "二宝", false);
        String secondId = second.path("id").asText();
        JsonNode feeding = createFeedingOnline(deviceId, firstId);
        String feedingId = feeding.path("id").asText();

        Map<String, Object> growthBody = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", firstId,
                "measuredOn", LocalDate.now(ZoneOffset.UTC).minusDays(1).toString(),
                "weightKg", 7.5);
        MvcResult growthResult = postJson("/api/v1/growth-records", deviceId, growthBody);
        assertThat(growthResult.getResponse().getStatus()).isEqualTo(200);
        String growthId = body(growthResult).path("data").path("record").path("id").asText();

        JsonNode data = push(deviceId, batch(List.of(
                deleteChange("BABY", firstId, 1))));

        assertThat(status(syncResult(data, 0))).isEqualTo("APPLIED");
        assertThat(revision(syncResult(data, 0))).isEqualTo(2);
        assertThat(record(syncResult(data, 0)).path("deletedAt").asText()).isNotBlank();

        assertError(getJson("/api/v1/babies/" + firstId, deviceId), 404, "NOT_FOUND");
        assertError(getJson("/api/v1/feeding-records/" + feedingId, deviceId),
                404, "NOT_FOUND");
        assertError(getJson("/api/v1/growth-records/" + growthId, deviceId),
                404, "NOT_FOUND");

        JsonNode promoted = body(getJson("/api/v1/babies/" + secondId, deviceId))
                .path("data");
        assertThat(promoted.path("isDefault").asBoolean()).isTrue();
        assertThat(promoted.path("revision").asInt()).isEqualTo(2);

        Integer feedingRevision = jdbcTemplate.queryForObject(
                "SELECT revision FROM feeding_record WHERE id = ?", Integer.class, feedingId);
        Integer feedingDeleted = jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM feeding_record WHERE id = ?",
                Integer.class, feedingId);
        assertThat(feedingRevision).isEqualTo(2);
        assertThat(feedingDeleted).isEqualTo(1);
    }
}
