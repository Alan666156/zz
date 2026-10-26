package com.zz.babyfeeding.growth;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class GrowthIntegrationTest extends IntegrationTestBase {

    private static final LocalDate BIRTH_DATE = LocalDate.parse("2026-03-01");
    private static final LocalDate TODAY = LocalDate.now(ZoneOffset.UTC);

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

    private static Map<String, Object> growthBody(String babyId, Object... overrides) {
        Map<String, Object> map = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "measuredOn", "2026-10-20",
                "heightCm", 68.5,
                "weightKg", 8.12,
                "headCircumferenceCm", 43.0,
                "note", "社区体检");
        map.putAll(payload(overrides));
        return map;
    }

    private static Map<String, Object> singleMetric(String babyId, String field, Object value) {
        return payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "measuredOn", "2026-10-20",
                field, value);
    }

    private JsonNode postRecord(String deviceId, Map<String, Object> body) throws Exception {
        MvcResult result = postJson("/api/v1/growth-records", deviceId, body);
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
    void createsSingleMetricRecordWithContractShape() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = "c2b3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";

        JsonNode data = postRecord(deviceId, payload(
                "id", id,
                "babyId", babyId,
                "measuredOn", "2026-10-20",
                "weightKg", 8.12,
                "note", "社区体检"));
        assertThat(data.path("created").asBoolean()).isTrue();
        JsonNode record = data.path("record");
        assertThat(record.path("id").asText()).isEqualTo(id);
        assertThat(record.path("babyId").asText()).isEqualTo(babyId);
        assertThat(record.path("measuredOn").asText()).isEqualTo("2026-10-20");
        assertThat(record.path("heightCm").isNull()).isTrue();
        assertThat(record.path("weightKg").asText()).isEqualTo("8.12");
        assertThat(record.path("headCircumferenceCm").isNull()).isTrue();
        assertThat(record.path("note").asText()).isEqualTo("社区体检");
        assertThat(record.path("revision").asInt()).isEqualTo(1);
        assertThat(record.path("deletedAt").isNull()).isTrue();
        assertThat(record.path("createdAt").asText()).endsWith("Z");
        assertThat(record.path("updatedAt").asText()).endsWith("Z");

        JsonNode fetched = body(getJson(
                "/api/v1/growth-records/" + id, deviceId)).path("data");
        assertThat(fetched).isEqualTo(record);

        JsonNode full = postRecord(deviceId, growthBody(babyId,
                "heightCm", 68, "weightKg", 8.5, "headCircumferenceCm", 43))
                .path("record");
        // readTree erases BigDecimal scale, so numeric values are compared as
        // doubles here; the raw scale is asserted in the precision test below.
        assertThat(full.path("heightCm").asDouble()).isEqualTo(68.0);
        assertThat(full.path("weightKg").asDouble()).isEqualTo(8.5);
        assertThat(full.path("headCircumferenceCm").asDouble()).isEqualTo(43.0);
    }

    @Test
    void requiresAtLeastOneMetric() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        assertError(postJson("/api/v1/growth-records", deviceId, payload(
                "babyId", babyId,
                "measuredOn", "2026-10-20")), 400, "VALIDATION_ERROR");
        assertError(postJson("/api/v1/growth-records", deviceId, payload(
                "babyId", babyId,
                "measuredOn", "2026-10-20",
                "heightCm", null,
                "weightKg", null,
                "headCircumferenceCm", null)), 400, "VALIDATION_ERROR");

        JsonNode onlyHeight = postRecord(deviceId, payload(
                "babyId", babyId,
                "measuredOn", "2026-10-20",
                "heightCm", 68.5));
        assertThat(onlyHeight.path("created").asBoolean()).isTrue();
        assertThat(onlyHeight.path("record").path("weightKg").isNull()).isTrue();
    }

    @Test
    void enforcesMetricBoundariesAndPrecision() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        List<Map.Entry<Map<String, Object>, Integer>> cases = List.of(
                Map.entry(singleMetric(babyId, "heightCm", 20.0), 200),
                Map.entry(singleMetric(babyId, "heightCm", 150.0), 200),
                Map.entry(singleMetric(babyId, "heightCm", 19.9), 400),
                Map.entry(singleMetric(babyId, "heightCm", 150.1), 400),
                Map.entry(singleMetric(babyId, "weightKg", 0.5), 200),
                Map.entry(singleMetric(babyId, "weightKg", 50), 200),
                Map.entry(singleMetric(babyId, "weightKg", 0.49), 400),
                Map.entry(singleMetric(babyId, "weightKg", 50.01), 400),
                Map.entry(singleMetric(babyId, "headCircumferenceCm", 20.0), 200),
                Map.entry(singleMetric(babyId, "headCircumferenceCm", 70.0), 200),
                Map.entry(singleMetric(babyId, "headCircumferenceCm", 19.9), 400),
                Map.entry(singleMetric(babyId, "headCircumferenceCm", 70.1), 400));
        for (Map.Entry<Map<String, Object>, Integer> entry : cases) {
            MvcResult result = postJson("/api/v1/growth-records", deviceId, entry.getKey());
            assertThat(result.getResponse().getStatus())
                    .as("payload=%s", entry.getKey()).isEqualTo(entry.getValue());
        }

        for (Map.Entry<Map<String, Object>, String> entry : List.of(
                Map.entry(singleMetric(babyId, "weightKg", 8.123), "weightKg"),
                Map.entry(singleMetric(babyId, "heightCm", 68.55), "heightCm"),
                Map.entry(singleMetric(babyId, "headCircumferenceCm", 43.55),
                        "headCircumferenceCm"),
                Map.entry(singleMetric(babyId, "weightKg", "8.12"), "weightKg"))) {
            assertFieldError(postJson("/api/v1/growth-records", deviceId, entry.getKey()),
                    entry.getValue());
        }

        MvcResult scaled = postJson("/api/v1/growth-records", deviceId,
                growthBody(babyId, "weightKg", 8.5, "heightCm", 68,
                        "headCircumferenceCm", 43));
        assertThat(scaled.getResponse().getStatus()).isEqualTo(200);
        String raw = scaled.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(raw).contains("\"weightKg\":8.50");
        assertThat(raw).contains("\"heightCm\":68.0");
        assertThat(raw).contains("\"headCircumferenceCm\":43.0");
    }

    @Test
    void validatesMeasuredOnWindowAndAllowsSameDay() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        for (String measuredOn : List.of(TODAY.toString(),
                TODAY.plusDays(1).toString(), BIRTH_DATE.toString())) {
            postRecord(deviceId, growthBody(babyId, "measuredOn", measuredOn));
        }
        postRecord(deviceId, growthBody(babyId, "measuredOn", TODAY.toString()));

        for (String measuredOn : List.of(TODAY.plusDays(2).toString(), "2026-02-28")) {
            assertFieldError(postJson("/api/v1/growth-records", deviceId,
                    growthBody(babyId, "measuredOn", measuredOn)), "measuredOn");
        }

        JsonNode list = body(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&size=100", deviceId)).path("data");
        assertThat(list.path("total").asInt()).isEqualTo(4);
        int todayCount = 0;
        for (JsonNode item : list.path("items")) {
            if (TODAY.toString().equals(item.path("measuredOn").asText())) {
                todayCount++;
            }
        }
        assertThat(todayCount).isEqualTo(2);
    }

    @Test
    void createIsIdempotentAndNeverRevivesTombstones() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = UUID.randomUUID().toString();

        JsonNode first = postRecord(deviceId, growthBody(babyId, "id", id));
        assertThat(first.path("created").asBoolean()).isTrue();

        JsonNode duplicate = postRecord(deviceId, growthBody(babyId,
                "id", id, "weightKg", 9.0));
        assertThat(duplicate.path("created").asBoolean()).isFalse();
        assertThat(duplicate.path("record").path("weightKg").asText()).isEqualTo("8.12");
        assertThat(duplicate.path("record").path("revision").asInt()).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM growth_record", Integer.class)).isEqualTo(1);

        assertThat(deleteJson("/api/v1/growth-records/" + id + "?baseRevision=1", deviceId)
                .getResponse().getStatus()).isEqualTo(200);
        assertError(postJson("/api/v1/growth-records", deviceId,
                growthBody(babyId, "id", id)), 404, "NOT_FOUND");
    }

    @Test
    void listsSortsFiltersAndPaginates() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        String olderId = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-18", "weightKg", 8.0)).path("record")
                .path("id").asText();
        String firstSameDay = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-20", "weightKg", 8.1)).path("record")
                .path("id").asText();
        String secondSameDay = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-20", "weightKg", 8.2)).path("record")
                .path("id").asText();
        String newestId = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-22", "weightKg", 8.3)).path("record")
                .path("id").asText();
        String deletedId = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-21", "weightKg", 8.25)).path("record")
                .path("id").asText();
        deleteJson("/api/v1/growth-records/" + deletedId + "?baseRevision=1", deviceId);

        JsonNode all = body(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&size=100", deviceId)).path("data");
        assertThat(all.path("total").asInt()).isEqualTo(4);
        assertThat(all.path("items").toString()).contains(newestId);
        assertThat(all.path("items").get(0).path("id").asText()).isEqualTo(newestId);
        assertThat(all.path("items").get(3).path("id").asText()).isEqualTo(olderId);
        assertThat(List.of(
                        all.path("items").get(1).path("id").asText(),
                        all.path("items").get(2).path("id").asText()))
                .containsExactlyInAnyOrder(firstSameDay, secondSameDay);

        JsonNode range = body(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&from=2026-10-20&to=2026-10-21&size=100", deviceId)).path("data");
        assertThat(range.path("total").asInt()).isEqualTo(2);

        assertThat(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&from=2025-10-20&to=2026-10-20", deviceId)
                .getResponse().getStatus()).isEqualTo(200);
        assertError(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&from=2025-10-19&to=2026-10-20", deviceId), 400, "VALIDATION_ERROR");
        assertError(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&from=2026-10-21&to=2026-10-20", deviceId), 400, "VALIDATION_ERROR");
        for (String query : List.of("size=101", "size=0", "page=0")) {
            assertError(getJson("/api/v1/growth-records?babyId=" + babyId + "&" + query,
                    deviceId), 400, "VALIDATION_ERROR");
        }

        JsonNode beyond = body(getJson("/api/v1/growth-records?babyId=" + babyId
                + "&page=99&size=20", deviceId)).path("data");
        assertThat(beyond.path("items")).isEmpty();
        assertThat(beyond.path("total").asInt()).isEqualTo(4);
    }

    @Test
    void latestReturnsNewestOrNull() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        String olderId = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-18")).path("record").path("id").asText();
        String newerId = postRecord(deviceId, growthBody(babyId,
                "measuredOn", "2026-10-20")).path("record").path("id").asText();

        JsonNode latest = body(getJson("/api/v1/growth-records/latest?babyId=" + babyId,
                deviceId)).path("data");
        assertThat(latest.path("id").asText()).isEqualTo(newerId);
        assertThat(latest.path("id").asText()).isNotEqualTo(olderId);

        MvcResult emptyBaby = postJson("/api/v1/babies", deviceId, payload(
                "name", "无记录", "birthDate", BIRTH_DATE.toString(),
                "isDefault", false));
        String emptyBabyId = body(emptyBaby).path("data").path("baby").path("id").asText();
        MvcResult empty = getJson("/api/v1/growth-records/latest?babyId=" + emptyBabyId,
                deviceId);
        assertThat(empty.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(empty).path("data").isNull()).isTrue();
    }

    @Test
    void patchClearsMetricsButKeepsAtLeastOne() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = postRecord(deviceId, growthBody(babyId)).path("record")
                .path("id").asText();

        JsonNode first = body(patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("baseRevision", 1, "weightKg", 8.5))).path("data");
        assertThat(first.path("weightKg").asDouble()).isEqualTo(8.5);
        assertThat(first.path("heightCm").asDouble()).isEqualTo(68.5);
        assertThat(first.path("headCircumferenceCm").asDouble()).isEqualTo(43.0);
        assertThat(first.path("revision").asInt()).isEqualTo(2);

        JsonNode second = body(patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("baseRevision", 2, "heightCm", null,
                        "headCircumferenceCm", null))).path("data");
        assertThat(second.path("heightCm").isNull()).isTrue();
        assertThat(second.path("headCircumferenceCm").isNull()).isTrue();
        assertThat(second.path("weightKg").asDouble()).isEqualTo(8.5);
        assertThat(second.path("revision").asInt()).isEqualTo(3);

        assertFieldError(patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("baseRevision", 3, "weightKg", null)), "metrics");
        JsonNode fetched = body(getJson("/api/v1/growth-records/" + id, deviceId))
                .path("data");
        assertThat(fetched.path("revision").asInt()).isEqualTo(3);
        assertThat(fetched.path("weightKg").asDouble()).isEqualTo(8.5);

        for (Object babyValue : new Object[]{babyId, UUID.randomUUID().toString(), null}) {
            assertFieldError(patchJson("/api/v1/growth-records/" + id, deviceId,
                    payload("baseRevision", 3, "babyId", babyValue)), "babyId");
        }

        MvcResult conflict = patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("baseRevision", 1, "weightKg", 9.9));
        assertError(conflict, 409, "CONFLICT");
        assertThat(body(conflict).path("data").path("current").path("revision").asInt())
                .isEqualTo(3);

        assertFieldError(patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("weightKg", 8.3)), "baseRevision");
    }

    @Test
    void deleteIsSoftIdempotentAndHidesTombstones() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String id = postRecord(deviceId, growthBody(babyId)).path("record")
                .path("id").asText();

        JsonNode first = body(deleteJson(
                "/api/v1/growth-records/" + id + "?baseRevision=1", deviceId)).path("data");
        assertThat(first.path("revision").asInt()).isEqualTo(2);
        assertThat(first.path("deletedAt").asText()).endsWith("Z");
        assertThat(first.path("alreadyDeleted").asBoolean()).isFalse();

        JsonNode again = body(deleteJson(
                "/api/v1/growth-records/" + id + "?baseRevision=2", deviceId)).path("data");
        assertThat(again.path("alreadyDeleted").asBoolean()).isTrue();
        assertThat(again.path("revision").asInt()).isEqualTo(2);

        assertError(getJson("/api/v1/growth-records/" + id, deviceId), 404, "NOT_FOUND");
        assertError(patchJson("/api/v1/growth-records/" + id, deviceId,
                payload("baseRevision", 2, "weightKg", 8.3)), 404, "NOT_FOUND");
        assertError(postJson("/api/v1/growth-records", deviceId,
                growthBody(babyId, "id", id)), 404, "NOT_FOUND");

        Boolean deleted = jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM growth_record WHERE id = ?",
                Boolean.class, id);
        assertThat(deleted).isTrue();
        JsonNode list = body(getJson("/api/v1/growth-records?babyId=" + babyId, deviceId))
                .path("data");
        assertThat(list.path("total").asInt()).isZero();
    }

    @Test
    void crossDeviceIsolationAndBabyCascade() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String recordId = postRecord(deviceId, growthBody(babyId)).path("record")
                .path("id").asText();

        String otherDevice = newDeviceId();
        String otherBaby = setupDeviceAndBaby(otherDevice);

        assertError(getJson("/api/v1/growth-records/" + recordId, otherDevice),
                404, "NOT_FOUND");
        assertError(getJson("/api/v1/growth-records?babyId=" + babyId, otherDevice),
                404, "NOT_FOUND");
        assertError(getJson("/api/v1/growth-records/latest?babyId=" + babyId, otherDevice),
                404, "NOT_FOUND");
        assertError(patchJson("/api/v1/growth-records/" + recordId, otherDevice,
                payload("baseRevision", 1, "weightKg", 9.0)), 404, "NOT_FOUND");
        assertError(deleteJson("/api/v1/growth-records/" + recordId
                + "?baseRevision=1", otherDevice), 404, "NOT_FOUND");
        assertError(postJson("/api/v1/growth-records", deviceId,
                growthBody(otherBaby)), 404, "NOT_FOUND");

        JsonNode untouched = body(getJson("/api/v1/growth-records/" + recordId, deviceId))
                .path("data");
        assertThat(untouched.path("weightKg").asText()).isEqualTo("8.12");
        assertThat(untouched.path("revision").asInt()).isEqualTo(1);

        // Deleting the baby cascades the growth tombstone and hides the listing.
        MvcResult deletedBaby = deleteJson(
                "/api/v1/babies/" + babyId + "?baseRevision=1", deviceId);
        assertThat(deletedBaby.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(deletedBaby).path("data").path("cascadedGrowthRecords").asInt())
                .isEqualTo(1);

        assertError(getJson("/api/v1/growth-records?babyId=" + babyId, deviceId),
                404, "NOT_FOUND");
        assertError(getJson("/api/v1/growth-records/latest?babyId=" + babyId, deviceId),
                404, "NOT_FOUND");

        Boolean deleted = jdbcTemplate.queryForObject(
                "SELECT deleted_at IS NOT NULL FROM growth_record WHERE id = ?",
                Boolean.class, recordId);
        Integer revision = jdbcTemplate.queryForObject(
                "SELECT revision FROM growth_record WHERE id = ?", Integer.class, recordId);
        assertThat(deleted).isTrue();
        assertThat(revision).isEqualTo(2);
    }
}
