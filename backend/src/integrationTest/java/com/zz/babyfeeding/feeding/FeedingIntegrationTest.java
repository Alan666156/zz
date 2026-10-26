package com.zz.babyfeeding.feeding;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class FeedingIntegrationTest extends IntegrationTestBase {

    private static final LocalDate BIRTH_DATE = LocalDate.parse("2026-03-01");

    // ---------------------------------------------------------------- helpers

    private static Map<String, Object> payload(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index < keyValues.length; index += 2) {
            map.put((String) keyValues[index], keyValues[index + 1]);
        }
        return map;
    }

    private String setupDeviceAndBaby(String deviceId) throws Exception {
        initDeviceOk(deviceId);
        MvcResult result = postJson("/api/v1/babies", deviceId, payload(
                "name", "小满",
                "gender", "FEMALE",
                "birthDate", BIRTH_DATE.toString()));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result).path("data").path("baby").path("id").asText();
    }

    private static Map<String, Object> breastBody(String babyId, Object... overrides) {
        Map<String, Object> map = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "BREAST",
                "breastSide", "LEFT",
                "durationSec", 900,
                "startedAt", "2026-10-20T08:00:00+08:00",
                "endedAt", "2026-10-20T08:15:00+08:00",
                "note", "中途有点吐奶",
                "tags", List.of("SPIT_UP"));
        map.putAll(payload(overrides));
        return map;
    }

    private static Map<String, Object> formulaBody(String babyId, Object... overrides) {
        Map<String, Object> map = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "FORMULA",
                "amountValue", 120,
                "amountUnit", "ML",
                "startedAt", "2026-10-20T10:00:00+08:00");
        map.putAll(payload(overrides));
        return map;
    }

    private static Map<String, Object> solidBody(String babyId, Object... overrides) {
        Map<String, Object> map = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "SOLID",
                "amountValue", 30,
                "amountUnit", "G",
                "startedAt", "2026-10-20T13:00:00+08:00");
        map.putAll(payload(overrides));
        return map;
    }

    private JsonNode postRecord(String deviceId, Map<String, Object> body) throws Exception {
        MvcResult result = postJson("/api/v1/feeding-records", deviceId, body);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result).path("data");
    }

    private void assertFieldError(MvcResult result, String field) throws Exception {
        assertError(result, 400, "VALIDATION_ERROR");
        boolean found = false;
        for (JsonNode item : body(result).path("data").path("fieldErrors")) {
            if (field.equals(item.path("field").asText())) {
                found = true;
                break;
            }
        }
        assertThat(found)
                .as("expected fieldErrors to contain %s, body=%s", field, body(result))
                .isTrue();
    }

    // ------------------------------------------------------------------ tests

    @Test
    void createsFourTypesAndEchoesContractShape() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        String breastId = "8f14e45f-ceea-4e7a-9d7b-3c1e2f4a5b6c";
        JsonNode breast = postRecord(deviceId,
                breastBody(babyId, "id", breastId));
        assertThat(breast.path("created").asBoolean()).isTrue();
        JsonNode record = breast.path("record");
        assertThat(record.path("id").asText()).isEqualTo(breastId);
        assertThat(record.path("babyId").asText()).isEqualTo(babyId);
        assertThat(record.path("feedType").asText()).isEqualTo("BREAST");
        assertThat(record.path("breastSide").asText()).isEqualTo("LEFT");
        assertThat(record.path("amountValue").isNull()).isTrue();
        assertThat(record.path("amountUnit").isNull()).isTrue();
        assertThat(record.path("durationSec").asInt()).isEqualTo(900);
        assertThat(record.path("startedAt").asText())
                .isEqualTo("2026-10-20T08:00:00+08:00");
        assertThat(record.path("endedAt").asText())
                .isEqualTo("2026-10-20T08:15:00+08:00");
        assertThat(record.path("recordDate").asText()).isEqualTo("2026-10-20");
        assertThat(record.path("tzOffsetMinutes").asInt()).isEqualTo(480);
        assertThat(record.path("note").asText()).isEqualTo("中途有点吐奶");
        assertThat(record.path("tags").toString()).isEqualTo("[\"SPIT_UP\"]");
        assertThat(record.path("revision").asInt()).isEqualTo(1);
        assertThat(record.path("deletedAt").isNull()).isTrue();
        assertThat(record.path("createdAt").asText()).endsWith("Z");
        assertThat(record.path("updatedAt").asText()).endsWith("Z");

        JsonNode fetched = body(getJson("/api/v1/feeding-records/" + breastId, deviceId))
                .path("data");
        assertThat(fetched).isEqualTo(record);

        JsonNode formula = postRecord(deviceId,
                formulaBody(babyId, "durationSec", null)).path("record");
        assertThat(formula.path("breastSide").isNull()).isTrue();
        assertThat(formula.path("amountValue").asText()).isEqualTo("120");
        assertThat(formula.path("amountUnit").asText()).isEqualTo("ML");
        assertThat(formula.path("durationSec").isNull()).isTrue();

        JsonNode mixed = postRecord(deviceId, breastBody(babyId,
                "feedType", "MIXED",
                "breastSide", "BOTH",
                "amountValue", 90,
                "amountUnit", "ML",
                "durationSec", 480,
                "startedAt", "2026-10-20T12:00:00+08:00",
                "endedAt", "2026-10-20T12:08:00+08:00",
                "tags", null)).path("record");
        assertThat(mixed.path("amountValue").asText()).isEqualTo("90");
        assertThat(mixed.path("tags").isNull()).isTrue();

        JsonNode solid = postRecord(deviceId, solidBody(babyId,
                "amountValue", null,
                "amountUnit", null)).path("record");
        assertThat(solid.path("amountValue").isNull()).isTrue();
        assertThat(solid.path("durationSec").isNull()).isTrue();

        JsonNode half = postRecord(deviceId, formulaBody(babyId,
                "amountValue", 120.5)).path("record");
        assertThat(half.path("amountValue").asText()).isEqualTo("120.5");
    }

    @Test
    void createIsIdempotentAndNeverRevivesTombstones() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = UUID.randomUUID().toString();

        JsonNode first = postRecord(deviceId, breastBody(babyId, "id", id));
        assertThat(first.path("created").asBoolean()).isTrue();

        JsonNode duplicate = postRecord(deviceId, breastBody(babyId,
                "id", id, "durationSec", 120));
        assertThat(duplicate.path("created").asBoolean()).isFalse();
        assertThat(duplicate.path("record").path("durationSec").asInt()).isEqualTo(900);
        assertThat(duplicate.path("record").path("revision").asInt()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record", Integer.class)).isEqualTo(1);

        assertThat(deleteJson("/api/v1/feeding-records/" + id + "?baseRevision=1", deviceId)
                .getResponse().getStatus()).isEqualTo(200);

        // Q-05: tombstoned id is 404 and is neither revived nor returned.
        assertError(postJson("/api/v1/feeding-records", deviceId,
                breastBody(babyId, "id", id)), 404, "NOT_FOUND");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record WHERE deleted_at IS NULL",
                Integer.class)).isZero();
    }

    @Test
    void enforcesTypeMatrixAndAmountPrecision() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        List<Map.Entry<Map<String, Object>, String>> invalid = List.of(
                Map.entry(breastBody(babyId, "breastSide", null), "breastSide"),
                Map.entry(breastBody(babyId, "amountValue", 10), "amountValue"),
                Map.entry(breastBody(babyId, "amountUnit", "ML"), "amountUnit"),
                Map.entry(breastBody(babyId, "durationSec", 0), "durationSec"),
                Map.entry(breastBody(babyId, "durationSec", 21601), "durationSec"),
                Map.entry(breastBody(babyId, "feedType", "breast"), "feedType"),
                Map.entry(breastBody(babyId, "feedType", "WATER"), "feedType"),
                Map.entry(formulaBody(babyId, "amountValue", null), "amountValue"),
                Map.entry(formulaBody(babyId, "amountValue", 0), "amountValue"),
                Map.entry(formulaBody(babyId, "amountValue", 500.01), "amountValue"),
                Map.entry(formulaBody(babyId, "amountValue", "120"), "amountValue"),
                Map.entry(formulaBody(babyId, "amountUnit", "G"), "amountUnit"),
                Map.entry(formulaBody(babyId, "breastSide", "LEFT"), "breastSide"),
                Map.entry(formulaBody(babyId, "durationSec", 21601), "durationSec"),
                Map.entry(solidBody(babyId, "amountValue", 0), "amountValue"),
                Map.entry(solidBody(babyId, "amountValue", 2000.01), "amountValue"),
                Map.entry(solidBody(babyId, "amountUnit", "ML"), "amountUnit"),
                Map.entry(solidBody(babyId, "breastSide", "LEFT"), "breastSide"));
        for (Map.Entry<Map<String, Object>, String> item : invalid) {
            assertFieldError(postJson("/api/v1/feeding-records", deviceId, item.getKey()),
                    item.getValue());
        }

        postRecord(deviceId, formulaBody(babyId, "amountValue", 500));
        postRecord(deviceId, formulaBody(babyId, "durationSec", 0));
        postRecord(deviceId, formulaBody(babyId, "durationSec", 21600));
        postRecord(deviceId, solidBody(babyId, "amountValue", 2000));
        postRecord(deviceId, solidBody(babyId, "amountValue", null, "amountUnit", null));

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record", Integer.class)).isEqualTo(5);
    }

    @Test
    void validatesTimestampsAgainstOffsetNowAndBirthDate() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                        formulaBody(babyId, "startedAt", "2026-10-20T08:00:00")),
                "startedAt");

        JsonNode utc = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-20T00:00:00Z")).path("record");
        assertThat(utc.path("tzOffsetMinutes").asInt()).isZero();
        assertThat(utc.path("startedAt").asText()).isEqualTo("2026-10-20T00:00:00Z");
        assertThat(utc.path("recordDate").asText()).isEqualTo("2026-10-20");

        String serverTime = body(getJson("/api/v1/babies", deviceId))
                .path("serverTime").asText();
        Instant now = Instant.parse(serverTime);
        postRecord(deviceId, formulaBody(babyId,
                "startedAt", now.plusSeconds(120).toString()));
        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                        formulaBody(babyId, "startedAt", now.plusSeconds(600).toString())),
                "startedAt");

        postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-03-01T00:30:00+08:00"));
        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                        formulaBody(babyId, "startedAt", "2026-02-28T23:30:00+08:00")),
                "startedAt");

        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                        breastBody(babyId, "endedAt", "2026-10-20T07:59:59+08:00")),
                "endedAt");
        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                        breastBody(babyId, "endedAt", "2026-10-20T14:00:01+08:00")),
                "endedAt");
        JsonNode sixHours = postRecord(deviceId, breastBody(babyId,
                "endedAt", "2026-10-20T14:00:00+08:00")).path("record");
        assertThat(sixHours.path("endedAt").asText())
                .isEqualTo("2026-10-20T14:00:00+08:00");
        JsonNode noEnd = postRecord(deviceId,
                breastBody(babyId, "endedAt", null)).path("record");
        assertThat(noEnd.path("endedAt").isNull()).isTrue();
    }

    @Test
    void validatesNoteTagsAndBabyOwnership() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        postRecord(deviceId, breastBody(babyId, "note", "备".repeat(200)));
        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                breastBody(babyId, "note", "备".repeat(201))), "note");

        JsonNode deduped = postRecord(deviceId,
                breastBody(babyId, "tags", List.of("SPIT_UP", "SPIT_UP"))).path("record");
        assertThat(deduped.path("tags").toString()).isEqualTo("[\"SPIT_UP\"]");

        JsonNode ordered = postRecord(deviceId, breastBody(babyId,
                "tags", List.of("SLEEPY", "SPIT_UP", "SLEEPY"))).path("record");
        assertThat(ordered.path("tags").toString()).isEqualTo("[\"SPIT_UP\",\"SLEEPY\"]");

        JsonNode max = postRecord(deviceId, breastBody(babyId,
                "tags", List.of("SPIT_UP", "REFUSED", "SLEEPY", "HICCUP", "OTHER")))
                .path("record");
        assertThat(max.path("tags")).hasSize(5);

        assertFieldError(postJson("/api/v1/feeding-records", deviceId,
                breastBody(babyId, "tags", List.of("UNKNOWN"))), "tags");

        // TZ-06: client-supplied recordDate/tzOffsetMinutes are ignored.
        JsonNode forged = postRecord(deviceId, breastBody(babyId,
                "recordDate", "1999-01-01",
                "tzOffsetMinutes", -720)).path("record");
        assertThat(forged.path("recordDate").asText()).isEqualTo("2026-10-20");
        assertThat(forged.path("tzOffsetMinutes").asInt()).isEqualTo(480);

        String otherDevice = newDeviceId();
        String otherBaby = setupDeviceAndBaby(otherDevice);
        assertError(postJson("/api/v1/feeding-records", deviceId,
                formulaBody(UUID.randomUUID().toString())), 404, "NOT_FOUND");
        assertError(postJson("/api/v1/feeding-records", deviceId,
                formulaBody(otherBaby)), 404, "NOT_FOUND");
        assertError(postJson("/api/v1/feeding-records", otherDevice,
                formulaBody(UUID.randomUUID().toString())), 404, "NOT_FOUND");
    }

    @Test
    void listsByLocalDateRangeAndPaginates() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        for (int hour = 8; hour <= 15; hour++) {
            postRecord(deviceId, formulaBody(babyId,
                    "startedAt", String.format("2026-10-20T%02d:00:00+08:00", hour)));
        }
        postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-19T09:00:00+08:00"));
        postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-21T09:00:00+08:00"));
        postRecord(deviceId, breastBody(babyId,
                "startedAt", "2026-10-20T09:30:00+08:00",
                "endedAt", null));

        JsonNode day = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20&size=100", deviceId)).path("data");
        assertThat(day.path("total").asInt()).isEqualTo(9);
        assertThat(day.path("items")).hasSize(9);
        assertThat(day.path("items").get(0).path("startedAt").asText())
                .isEqualTo("2026-10-20T15:00:00+08:00");
        assertThat(day.path("items").get(8).path("startedAt").asText())
                .isEqualTo("2026-10-20T08:00:00+08:00");

        JsonNode breastOnly = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20&feedType=BREAST", deviceId)).path("data");
        assertThat(breastOnly.path("total").asInt()).isEqualTo(1);

        JsonNode range = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&from=2026-10-19&to=2026-10-21", deviceId)).path("data");
        assertThat(range.path("total").asInt()).isEqualTo(11);

        // 92-day span accepted, 93 rejected (Q range bound).
        body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&from=2026-03-31&to=2026-06-30", deviceId));
        assertError(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&from=2026-03-30&to=2026-06-30", deviceId), 400, "VALIDATION_ERROR");

        assertError(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20&from=2026-10-01&to=2026-10-31", deviceId),
                400, "VALIDATION_ERROR");
        assertError(getJson("/api/v1/feeding-records?babyId=" + babyId, deviceId),
                400, "VALIDATION_ERROR");
        for (String query : List.of("feedType=UNKNOWN", "size=101", "size=0", "page=0")) {
            assertError(getJson("/api/v1/feeding-records?babyId=" + babyId
                    + "&date=2026-10-20&" + query, deviceId), 400, "VALIDATION_ERROR");
        }

        JsonNode secondPage = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20&page=2&size=4", deviceId)).path("data");
        assertThat(secondPage.path("page").asInt()).isEqualTo(2);
        assertThat(secondPage.path("size").asInt()).isEqualTo(4);
        assertThat(secondPage.path("items")).hasSize(4);
        assertThat(secondPage.path("hasNext").asBoolean()).isTrue();

        JsonNode beyond = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20&page=99&size=20", deviceId)).path("data");
        assertThat(beyond.path("items")).isEmpty();
        assertThat(beyond.path("total").asInt()).isEqualTo(9);
        assertThat(beyond.path("hasNext").asBoolean()).isFalse();

        assertError(getJson("/api/v1/feeding-records?babyId=" + UUID.randomUUID()
                + "&date=2026-10-20", deviceId), 404, "NOT_FOUND");
    }

    @Test
    void patchMergesRevalidatesAndRejectsBabyId() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = postRecord(deviceId, breastBody(babyId, "note", "原始备注"))
                .path("record").path("id").asText();

        JsonNode patched = body(patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 1,
                        "durationSec", 960,
                        "note", "已补喂 30ml"))).path("data");
        assertThat(patched.path("durationSec").asInt()).isEqualTo(960);
        assertThat(patched.path("note").asText()).isEqualTo("已补喂 30ml");
        assertThat(patched.path("breastSide").asText()).isEqualTo("LEFT");
        assertThat(patched.path("startedAt").asText())
                .isEqualTo("2026-10-20T08:00:00+08:00");
        assertThat(patched.path("revision").asInt()).isEqualTo(2);

        assertFieldError(patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 2, "amountValue", 30, "amountUnit", "ML")),
                "amountValue");

        for (Object babyValue : new Object[]{UUID.randomUUID().toString(), babyId, null}) {
            assertFieldError(patchJson("/api/v1/feeding-records/" + id, deviceId,
                    payload("baseRevision", 2, "babyId", babyValue)), "babyId");
        }

        JsonNode still = body(getJson("/api/v1/feeding-records/" + id, deviceId)).path("data");
        assertThat(still.path("revision").asInt()).isEqualTo(2);
        assertThat(still.path("babyId").asText()).isEqualTo(babyId);

        MvcResult conflict = patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 1, "note", "过期"));
        assertError(conflict, 409, "CONFLICT");
        assertThat(body(conflict).path("data").path("current").path("revision").asInt())
                .isEqualTo(2);
        assertThat(body(conflict).path("data").path("current").path("note").asText())
                .isEqualTo("已补喂 30ml");

        assertFieldError(patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("note", "缺少 revision")), "baseRevision");

        // Changing BREAST to FORMULA is only valid when the merged row satisfies
        // the FORMULA matrix.
        JsonNode converted = body(patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 2,
                        "feedType", "FORMULA",
                        "breastSide", null,
                        "amountValue", 150,
                        "amountUnit", "ML",
                        "durationSec", null))).path("data");
        assertThat(converted.path("feedType").asText()).isEqualTo("FORMULA");
        assertThat(converted.path("breastSide").isNull()).isTrue();
        assertThat(converted.path("amountValue").asText()).isEqualTo("150");
        assertThat(converted.path("durationSec").isNull()).isTrue();
        assertThat(converted.path("revision").asInt()).isEqualTo(3);
    }

    @Test
    void deleteIsSoftIdempotentAndHidesTombstones() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = UUID.randomUUID().toString();
        postRecord(deviceId, breastBody(babyId, "id", id));
        String otherId = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-20T11:00:00+08:00"))
                .path("record").path("id").asText();

        JsonNode first = body(deleteJson(
                "/api/v1/feeding-records/" + id + "?baseRevision=1", deviceId)).path("data");
        assertThat(first.path("revision").asInt()).isEqualTo(2);
        assertThat(first.path("deletedAt").asText()).endsWith("Z");
        assertThat(first.path("alreadyDeleted").asBoolean()).isFalse();

        JsonNode second = body(deleteJson(
                "/api/v1/feeding-records/" + id + "?baseRevision=1", deviceId)).path("data");
        assertThat(second.path("alreadyDeleted").asBoolean()).isTrue();
        assertThat(second.path("deletedAt").asText())
                .isEqualTo(first.path("deletedAt").asText());
        assertThat(second.path("revision").asInt()).isEqualTo(2);

        MvcResult conflict = deleteJson(
                "/api/v1/feeding-records/" + otherId + "?baseRevision=99", deviceId);
        assertError(conflict, 409, "CONFLICT");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT deleted_at FROM feeding_record WHERE id = ?",
                java.sql.Timestamp.class, otherId)).isNull();

        MvcResult deletedGet = getJson("/api/v1/feeding-records/" + id, deviceId);
        MvcResult randomGet = getJson(
                "/api/v1/feeding-records/" + UUID.randomUUID(), deviceId);
        assertError(deletedGet, 404, "NOT_FOUND");
        assertError(randomGet, 404, "NOT_FOUND");
        assertThat(body(deletedGet).path("message")).isEqualTo(body(randomGet).path("message"));
        assertThat(body(deletedGet).path("data")).isEqualTo(body(randomGet).path("data"));

        assertError(patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 2, "note", "不应生效")), 404, "NOT_FOUND");

        JsonNode list = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20", deviceId)).path("data");
        assertThat(list.path("total").asInt()).isEqualTo(1);
    }

    @Test
    void writesBumpStatsVersionAndCrossDeviceIsIsolated() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String statsKey = redisKeys.statsVersion(deviceIdHasher.hashHex(deviceId), babyId);

        assertThat(stringRedisTemplate.opsForValue().get(statsKey)).isNull();

        JsonNode created = postRecord(deviceId, breastBody(babyId));
        String id = created.path("record").path("id").asText();
        assertThat(stringRedisTemplate.opsForValue().get(statsKey)).isEqualTo("1");

        patchJson("/api/v1/feeding-records/" + id, deviceId,
                payload("baseRevision", 1, "note", "改"));
        assertThat(stringRedisTemplate.opsForValue().get(statsKey)).isEqualTo("2");

        deleteJson("/api/v1/feeding-records/" + id + "?baseRevision=2", deviceId);
        assertThat(stringRedisTemplate.opsForValue().get(statsKey)).isEqualTo("3");

        String otherDevice = newDeviceId();
        setupDeviceAndBaby(otherDevice);
        JsonNode foreign = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-20T16:00:00+08:00")).path("record");
        String foreignId = foreign.path("id").asText();

        assertError(getJson("/api/v1/feeding-records/" + foreignId, otherDevice),
                404, "NOT_FOUND");
        assertError(patchJson("/api/v1/feeding-records/" + foreignId, otherDevice,
                payload("baseRevision", 1, "note", "越权")), 404, "NOT_FOUND");
        assertError(deleteJson("/api/v1/feeding-records/" + foreignId
                + "?baseRevision=1", otherDevice), 404, "NOT_FOUND");
        // The legitimate owner still sees the record untouched.
        JsonNode owned = body(getJson("/api/v1/feeding-records/" + foreignId, deviceId))
                .path("data");
        assertThat(owned.path("revision").asInt()).isEqualTo(1);
        assertThat(owned.path("note").isNull()).isTrue();
    }

    @Test
    void localDateBucketAndOffsetArePreserved() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        JsonNode beforeMidnight = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-20T23:59:59+08:00")).path("record");
        JsonNode afterMidnight = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-21T00:00:00+08:00")).path("record");
        assertThat(beforeMidnight.path("recordDate").asText()).isEqualTo("2026-10-20");
        assertThat(afterMidnight.path("recordDate").asText()).isEqualTo("2026-10-21");

        JsonNode day20 = body(getJson("/api/v1/feeding-records?babyId=" + babyId
                + "&date=2026-10-20", deviceId)).path("data");
        assertThat(day20.path("total").asInt()).isEqualTo(1);
        assertThat(day20.path("items").get(0).path("id").asText())
                .isEqualTo(beforeMidnight.path("id").asText());

        // Same UTC instant, different local dates.
        JsonNode plusEight = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-20T01:00:00+08:00")).path("record");
        JsonNode utc = postRecord(deviceId, formulaBody(babyId,
                "startedAt", "2026-10-19T17:00:00+00:00")).path("record");
        assertThat(plusEight.path("recordDate").asText()).isEqualTo("2026-10-20");
        assertThat(plusEight.path("tzOffsetMinutes").asInt()).isEqualTo(480);
        assertThat(plusEight.path("startedAt").asText())
                .isEqualTo("2026-10-20T01:00:00+08:00");
        assertThat(utc.path("recordDate").asText()).isEqualTo("2026-10-19");
        assertThat(utc.path("tzOffsetMinutes").asInt()).isZero();

        String plusEightUtc = jdbcTemplate.queryForObject(
                "SELECT DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') FROM feeding_record"
                        + " WHERE id = ?", String.class,
                plusEight.path("id").asText());
        String utcUtc = jdbcTemplate.queryForObject(
                "SELECT DATE_FORMAT(started_at, '%Y-%m-%d %H:%i:%s') FROM feeding_record"
                        + " WHERE id = ?", String.class,
                utc.path("id").asText());
        assertThat(plusEightUtc).isEqualTo("2026-10-19 17:00:00");
        assertThat(utcUtc).isEqualTo("2026-10-19 17:00:00");
    }
}
