package com.zz.babyfeeding.stats;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the executable STATS-01..09 acceptance cases plus the TZ-05
 * local-date grouping rule. Fixture data matches docs/tests §4.2.
 */
class StatsIntegrationTest extends IntegrationTestBase {

    private static final LocalDate BIRTH_DATE = LocalDate.parse("2025-01-01");
    private static final String DAY = "2026-10-20";

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

    private JsonNode createFeeding(String deviceId, String babyId, Object... overrides)
            throws Exception {
        Map<String, Object> body = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "FORMULA",
                "amountValue", 120,
                "amountUnit", "ML",
                "startedAt", DAY + "T10:00:00+08:00");
        body.putAll(payload(overrides));
        MvcResult result = postJson("/api/v1/feeding-records", deviceId, body);
        assertThat(result.getResponse().getStatus())
                .as("create feeding body=%s response=%s", body,
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data").path("record");
    }

    /** Writes fixture rows 1-8 and creates/deletes row 9, like the acceptance suite. */
    private Map<String, String> seedStatsFixture(String deviceId, String babyId)
            throws Exception {
        Map<String, String> ids = new LinkedHashMap<>();
        ids.put("breastLeft", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "LEFT",
                "amountValue", null, "amountUnit", null,
                "durationSec", 900,
                "startedAt", DAY + "T08:00:00+08:00",
                "endedAt", DAY + "T08:15:00+08:00",
                "note", "中途有点吐奶", "tags", List.of("SPIT_UP"))
                .path("id").asText());
        ids.put("breastRight", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "RIGHT",
                "amountValue", null, "amountUnit", null,
                "durationSec", 600,
                "startedAt", DAY + "T09:00:00+08:00",
                "endedAt", DAY + "T09:10:00+08:00")
                .path("id").asText());
        ids.put("formula120", createFeeding(deviceId, babyId,
                "feedType", "FORMULA", "amountValue", 120, "amountUnit", "ML",
                "durationSec", 300,
                "startedAt", DAY + "T10:00:00+08:00",
                "endedAt", DAY + "T10:05:00+08:00")
                .path("id").asText());
        ids.put("formula150", createFeeding(deviceId, babyId,
                "feedType", "FORMULA", "amountValue", 150, "amountUnit", "ML",
                "startedAt", DAY + "T11:00:00+08:00")
                .path("id").asText());
        ids.put("mixed", createFeeding(deviceId, babyId,
                "feedType", "MIXED", "breastSide", "BOTH",
                "amountValue", 90, "amountUnit", "ML",
                "durationSec", 480,
                "startedAt", DAY + "T12:00:00+08:00",
                "endedAt", DAY + "T12:08:00+08:00")
                .path("id").asText());
        ids.put("solid30", createFeeding(deviceId, babyId,
                "feedType", "SOLID", "amountValue", 30, "amountUnit", "G",
                "durationSec", 120,
                "startedAt", DAY + "T13:00:00+08:00",
                "endedAt", DAY + "T13:02:00+08:00")
                .path("id").asText());
        ids.put("breastBoth", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "BOTH",
                "amountValue", null, "amountUnit", null,
                "durationSec", 1200,
                "startedAt", DAY + "T14:00:00+08:00",
                "endedAt", DAY + "T14:20:00+08:00")
                .path("id").asText());
        ids.put("solid20", createFeeding(deviceId, babyId,
                "feedType", "SOLID", "amountValue", 20, "amountUnit", "G",
                "startedAt", DAY + "T15:00:00+08:00")
                .path("id").asText());
        String deletedId = createFeeding(deviceId, babyId,
                "feedType", "FORMULA", "amountValue", 500, "amountUnit", "ML",
                "durationSec", 600,
                "startedAt", DAY + "T16:00:00+08:00",
                "endedAt", DAY + "T16:10:00+08:00")
                .path("id").asText();
        assertThat(deleteJson("/api/v1/feeding-records/" + deletedId
                + "?baseRevision=1", deviceId).getResponse().getStatus()).isEqualTo(200);
        return ids;
    }

    private JsonNode daily(String deviceId, String babyId, String date) throws Exception {
        MvcResult result = getJson("/api/v1/stats/daily?babyId=" + babyId + "&date=" + date,
                deviceId);
        assertThat(result.getResponse().getStatus())
                .as("daily response=%s",
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data");
    }

    private JsonNode trend(String deviceId, String babyId, String from, String to)
            throws Exception {
        MvcResult result = getJson("/api/v1/stats/trend?babyId=" + babyId
                + "&from=" + from + "&to=" + to, deviceId);
        assertThat(result.getResponse().getStatus())
                .as("trend response=%s",
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data");
    }

    // ------------------------------------------------------------------ tests

    @Test
    void emptyDailyReturnsZeroValues() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        MvcResult result = getJson("/api/v1/stats/daily?babyId=" + babyId
                + "&date=2026-10-19", deviceId);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode data = body(result).path("data");

        assertThat(data.path("babyId").asText()).isEqualTo(babyId);
        assertThat(data.path("date").asText()).isEqualTo("2026-10-19");
        assertThat(data.path("feedingCount").asInt()).isZero();
        assertThat(data.path("byType").path("BREAST").asInt()).isZero();
        assertThat(data.path("byType").path("FORMULA").asInt()).isZero();
        assertThat(data.path("byType").path("MIXED").asInt()).isZero();
        assertThat(data.path("byType").path("SOLID").asInt()).isZero();
        assertThat(data.path("totalAmountMl").asDouble()).isEqualTo(0.0);
        assertThat(data.path("totalSolidG").asDouble()).isEqualTo(0.0);
        assertThat(data.path("totalBreastDurationSec").asInt()).isZero();
        assertThat(data.path("totalDurationSec").asInt()).isZero();
        assertThat(data.path("avgAmountMl").isNull()).isTrue();
        assertThat(data.path("lastFeedingAt").isNull()).isTrue();
        assertThat(data.path("cached").asBoolean()).isFalse();

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(raw).contains("\"totalAmountMl\":0.0");
        assertThat(raw).contains("\"totalSolidG\":0.0");
    }

    @Test
    void dailyAggregatesFixtureExactly() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedStatsFixture(deviceId, babyId);

        MvcResult result = getJson("/api/v1/stats/daily?babyId=" + babyId
                + "&date=" + DAY, deviceId);
        JsonNode data = body(result).path("data");

        assertThat(data.path("babyId").asText()).isEqualTo(babyId);
        assertThat(data.path("date").asText()).isEqualTo(DAY);
        assertThat(data.path("feedingCount").asInt()).isEqualTo(8);
        assertThat(data.path("byType").size()).isEqualTo(4);
        assertThat(data.path("byType").path("BREAST").asInt()).isEqualTo(3);
        assertThat(data.path("byType").path("FORMULA").asInt()).isEqualTo(2);
        assertThat(data.path("byType").path("MIXED").asInt()).isEqualTo(1);
        assertThat(data.path("byType").path("SOLID").asInt()).isEqualTo(2);
        assertThat(data.path("totalAmountMl").asDouble()).isEqualTo(360.0);
        assertThat(data.path("totalSolidG").asDouble()).isEqualTo(50.0);
        assertThat(data.path("totalBreastDurationSec").asInt()).isEqualTo(3180);
        assertThat(data.path("totalDurationSec").asInt()).isEqualTo(3600);
        assertThat(data.path("avgAmountMl").asDouble()).isEqualTo(120.0);
        assertThat(data.path("lastFeedingAt").asText())
                .isEqualTo("2026-10-20T15:00:00+08:00");

        String raw = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(raw).contains("\"totalAmountMl\":360.0");
        assertThat(raw).contains("\"totalSolidG\":50.0");
        assertThat(raw).contains("\"avgAmountMl\":120.0");
    }

    @Test
    void excludesDeletedOtherBabyAndOtherDevice() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        Map<String, String> ids = seedStatsFixture(deviceId, babyId);

        String otherBabyId = createBaby(deviceId, "B2", false).path("id").asText();
        createFeeding(deviceId, otherBabyId);

        String otherDeviceId = newDeviceId();
        String otherBaby = setupDeviceAndBaby(otherDeviceId);
        createFeeding(otherDeviceId, otherBaby);

        JsonNode before = daily(deviceId, babyId, DAY);
        assertThat(before.path("feedingCount").asInt()).isEqualTo(8);
        assertThat(before.path("totalAmountMl").asDouble()).isEqualTo(360.0);

        assertThat(deleteJson("/api/v1/feeding-records/" + ids.get("breastLeft")
                + "?baseRevision=1", deviceId).getResponse().getStatus()).isEqualTo(200);

        JsonNode after = daily(deviceId, babyId, DAY);
        assertThat(after.path("feedingCount").asInt()).isEqualTo(7);
        assertThat(after.path("totalAmountMl").asDouble()).isEqualTo(360.0);
        assertThat(after.path("totalBreastDurationSec").asInt()).isEqualTo(2280);
        assertThat(after.path("totalDurationSec").asInt()).isEqualTo(2700);
    }

    @Test
    void dailyAveragesAndLastFeedingTime() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedStatsFixture(deviceId, babyId);
        createFeeding(deviceId, babyId, "amountValue", 100,
                "startedAt", DAY + "T17:00:00+08:00");

        JsonNode data = daily(deviceId, babyId, DAY);
        assertThat(data.path("totalAmountMl").asDouble()).isEqualTo(460.0);
        assertThat(data.path("avgAmountMl").asDouble()).isEqualTo(115.0);
        assertThat(data.path("totalDurationSec").asInt()).isEqualTo(3600);
        assertThat(data.path("lastFeedingAt").asText())
                .isEqualTo("2026-10-20T17:00:00+08:00");
    }

    @Test
    void dailyValidatesParametersOwnershipAndAllowsFutureDates() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String otherDeviceId = newDeviceId();
        setupDeviceAndBaby(otherDeviceId);

        for (String query : List.of(
                "?babyId=" + babyId,
                "?babyId=" + babyId + "&date=2026-13-01",
                "?babyId=" + babyId + "&date=2026/10/20",
                "?date=2026-10-20",
                "?babyId=" + babyId + "&date=")) {
            assertError(getJson("/api/v1/stats/daily" + query, deviceId),
                    400, "VALIDATION_ERROR");
        }

        assertError(getJson("/api/v1/stats/daily?babyId=" + UUID.randomUUID()
                + "&date=2026-10-20", deviceId), 404, "NOT_FOUND");
        assertError(getJson("/api/v1/stats/daily?babyId=" + babyId
                + "&date=2026-10-20", otherDeviceId), 404, "NOT_FOUND");

        JsonNode future = daily(deviceId, babyId, "2099-01-01");
        assertThat(future.path("feedingCount").asInt()).isZero();
        assertThat(future.path("totalAmountMl").asDouble()).isEqualTo(0.0);
    }

    @Test
    void dailyCacheHitsAndIsInvalidatedByWrites() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        createFeeding(deviceId, babyId, "amountValue", 50);

        JsonNode first = daily(deviceId, babyId, DAY);
        assertThat(first.path("cached").asBoolean()).isFalse();
        assertThat(first.path("feedingCount").asInt()).isEqualTo(1);
        assertThat(first.path("totalAmountMl").asDouble()).isEqualTo(50.0);

        JsonNode second = daily(deviceId, babyId, DAY);
        assertThat(second.path("cached").asBoolean()).isTrue();
        assertThat(second.path("feedingCount").asInt()).isEqualTo(1);
        assertThat(second.path("totalAmountMl").asDouble()).isEqualTo(50.0);

        createFeeding(deviceId, babyId, "amountValue", 50,
                "startedAt", DAY + "T11:00:00+08:00");

        JsonNode afterWrite = daily(deviceId, babyId, DAY);
        assertThat(afterWrite.path("cached").asBoolean()).isFalse();
        assertThat(afterWrite.path("feedingCount").asInt()).isEqualTo(2);
        assertThat(afterWrite.path("totalAmountMl").asDouble()).isEqualTo(100.0);

        String versionKey = redisKeys.statsVersion(
                deviceIdHasher.hashHex(deviceId), babyId);
        assertThat(stringRedisTemplate.opsForValue().get(versionKey)).isEqualTo("2");
    }

    @Test
    void trendZeroFillsAndReturnsExactPoints() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedStatsFixture(deviceId, babyId);
        createFeeding(deviceId, babyId, "amountValue", 120,
                "durationSec", 300,
                "startedAt", "2026-10-21T09:00:00+08:00");

        JsonNode data = trend(deviceId, babyId, "2026-10-19", "2026-10-21");
        assertThat(data.path("babyId").asText()).isEqualTo(babyId);
        assertThat(data.path("from").asText()).isEqualTo("2026-10-19");
        assertThat(data.path("to").asText()).isEqualTo("2026-10-21");
        assertThat(data.path("granularity").asText()).isEqualTo("DAY");
        assertThat(data.path("points")).hasSize(3);
        assertThat(data.path("cached").asBoolean()).isFalse();

        JsonNode empty = data.path("points").get(0);
        assertThat(empty.path("date").asText()).isEqualTo("2026-10-19");
        assertThat(empty.path("feedingCount").asInt()).isZero();
        assertThat(empty.path("totalAmountMl").asDouble()).isEqualTo(0.0);
        assertThat(empty.path("totalSolidG").asDouble()).isEqualTo(0.0);
        assertThat(empty.path("totalBreastDurationSec").asInt()).isZero();
        assertThat(empty.path("totalDurationSec").asInt()).isZero();
        assertThat(empty.path("avgDurationSec").isNull()).isTrue();

        JsonNode fixturePoint = data.path("points").get(1);
        assertThat(fixturePoint.path("date").asText()).isEqualTo(DAY);
        assertThat(fixturePoint.path("feedingCount").asInt()).isEqualTo(8);
        assertThat(fixturePoint.path("totalAmountMl").asDouble()).isEqualTo(360.0);
        assertThat(fixturePoint.path("totalSolidG").asDouble()).isEqualTo(50.0);
        assertThat(fixturePoint.path("totalBreastDurationSec").asInt()).isEqualTo(3180);
        assertThat(fixturePoint.path("totalDurationSec").asInt()).isEqualTo(3600);
        assertThat(fixturePoint.path("avgDurationSec").asInt()).isEqualTo(600);

        JsonNode next = data.path("points").get(2);
        assertThat(next.path("date").asText()).isEqualTo("2026-10-21");
        assertThat(next.path("feedingCount").asInt()).isEqualTo(1);
        assertThat(next.path("totalAmountMl").asDouble()).isEqualTo(120.0);
        assertThat(next.path("totalSolidG").asDouble()).isEqualTo(0.0);
        assertThat(next.path("totalBreastDurationSec").asInt()).isZero();
        assertThat(next.path("totalDurationSec").asInt()).isEqualTo(300);
        assertThat(next.path("avgDurationSec").asInt()).isEqualTo(300);

        JsonNode cached = trend(deviceId, babyId, "2026-10-19", "2026-10-21");
        assertThat(cached.path("cached").asBoolean()).isTrue();
        assertThat(cached.path("points")).isEqualTo(data.path("points"));
    }

    @Test
    void trendValidatesParametersRangeAndOwnership() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String otherDeviceId = newDeviceId();
        setupDeviceAndBaby(otherDeviceId);

        for (String query : List.of(
                "?babyId=" + babyId + "&from=2026-10-01",
                "?babyId=" + babyId + "&to=2026-10-01",
                "?babyId=" + babyId + "&from=2026-10-21&to=2026-10-01",
                "?babyId=" + babyId + "&from=2026/10/01&to=2026/10/02",
                "?from=2026-10-01&to=2026-10-02")) {
            assertError(getJson("/api/v1/stats/trend" + query, deviceId),
                    400, "VALIDATION_ERROR");
        }

        JsonNode ninety = trend(deviceId, babyId, "2026-01-01", "2026-03-31");
        assertThat(ninety.path("points")).hasSize(90);

        assertError(getJson("/api/v1/stats/trend?babyId=" + babyId
                + "&from=2025-12-31&to=2026-03-31", deviceId),
                400, "VALIDATION_ERROR");
        assertError(getJson("/api/v1/stats/trend?babyId=" + babyId
                + "&from=2026-10-01&to=2026-10-02", otherDeviceId),
                404, "NOT_FOUND");
    }

    @Test
    void averagesUseHalfUpRounding() throws Exception {
        String deviceId = newDeviceId();
        String babyIdA = setupDeviceAndBaby(deviceId);
        String babyIdB = createBaby(deviceId, "B2", false).path("id").asText();
        String babyIdC = createBaby(deviceId, "B3", false).path("id").asText();

        for (int index = 0; index < 3; index++) {
            int duration = index == 0 ? 100 : 101;
            createFeeding(deviceId, babyIdA,
                    "durationSec", duration,
                    "startedAt", String.format("2026-10-01T%02d:00:00+08:00", 8 + index));
        }
        createFeeding(deviceId, babyIdA,
                "startedAt", "2026-10-01T12:00:00+08:00");

        JsonNode trendA = trend(deviceId, babyIdA, "2026-10-01", "2026-10-01");
        assertThat(trendA.path("points").get(0).path("avgDurationSec").asInt())
                .isEqualTo(101);

        for (int index = 0; index < 2; index++) {
            createFeeding(deviceId, babyIdB,
                    "durationSec", index == 0 ? 100 : 101,
                    "startedAt", String.format("2026-10-02T%02d:00:00+08:00", 8 + index));
        }
        JsonNode trendB = trend(deviceId, babyIdB, "2026-10-02", "2026-10-02");
        assertThat(trendB.path("points").get(0).path("avgDurationSec").asInt())
                .isEqualTo(101);

        int[] amounts = {100, 100, 100, 101};
        for (int index = 0; index < amounts.length; index++) {
            createFeeding(deviceId, babyIdC,
                    "amountValue", amounts[index],
                    "startedAt", String.format("2026-10-03T%02d:00:00+08:00", 8 + index));
        }
        JsonNode dailyC = daily(deviceId, babyIdC, "2026-10-03");
        assertThat(dailyC.path("avgAmountMl").asDouble()).isEqualTo(100.3);
    }

    @Test
    void groupsByRecordLocalDateAcrossMidnightAndYearBoundary() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        JsonNode newYearEve = createFeeding(deviceId, babyId,
                "amountValue", 100,
                "startedAt", "2025-12-31T23:30:00+08:00");
        JsonNode newYear = createFeeding(deviceId, babyId,
                "amountValue", 50,
                "startedAt", "2026-01-01T00:30:00+08:00");
        assertThat(newYearEve.path("recordDate").asText()).isEqualTo("2025-12-31");
        assertThat(newYearEve.path("tzOffsetMinutes").asInt()).isEqualTo(480);
        assertThat(newYear.path("recordDate").asText()).isEqualTo("2026-01-01");

        JsonNode dec31 = daily(deviceId, babyId, "2025-12-31");
        assertThat(dec31.path("feedingCount").asInt()).isEqualTo(1);
        assertThat(dec31.path("totalAmountMl").asDouble()).isEqualTo(100.0);

        JsonNode jan01 = daily(deviceId, babyId, "2026-01-01");
        assertThat(jan01.path("feedingCount").asInt()).isEqualTo(1);
        assertThat(jan01.path("totalAmountMl").asDouble()).isEqualTo(50.0);

        // Same UTC day (2025-12-31) but different local dates: not merged.
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feeding_record WHERE record_date = ?",
                Integer.class, LocalDate.parse("2025-12-31"))).isEqualTo(1);

        createFeeding(deviceId, babyId,
                "amountValue", 120,
                "startedAt", "2026-10-20T23:59:59+08:00");
        assertThat(daily(deviceId, babyId, "2026-10-20")
                .path("totalAmountMl").asDouble()).isEqualTo(120.0);
        assertThat(daily(deviceId, babyId, "2026-10-21")
                .path("feedingCount").asInt()).isZero();
    }
}
