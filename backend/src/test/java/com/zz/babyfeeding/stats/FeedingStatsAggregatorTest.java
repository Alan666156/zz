package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.feeding.FeedingRecordEntity;
import com.zz.babyfeeding.stats.dto.DailyStatsResponse;
import com.zz.babyfeeding.stats.dto.TrendPoint;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class FeedingStatsAggregatorTest {

    private static final String BABY_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    private static final LocalDate DAY = LocalDate.parse("2026-10-20");

    private static FeedingRecordEntity record(String id,
                                              String type,
                                              String startedAt,
                                              BigDecimal amount,
                                              String unit,
                                              Integer durationSec) {
        OffsetDateTime local = OffsetDateTime.parse(startedAt);
        FeedingRecordEntity entity = new FeedingRecordEntity();
        entity.setId(id);
        entity.setBabyId(BABY_ID);
        entity.setFeedType(type);
        entity.setAmountValue(amount);
        entity.setAmountUnit(unit);
        entity.setDurationSec(durationSec);
        entity.setStartedAt(TimeUtils.toUtc(local));
        entity.setTzOffsetMinutes(TimeUtils.tzOffsetMinutes(local));
        entity.setRecordDate(TimeUtils.recordDate(local));
        return entity;
    }

    private static BigDecimal ml(String value) {
        return new BigDecimal(value);
    }

    /** Same eight active rows as the stats fixture in docs/tests §4.2. */
    private static List<FeedingRecordEntity> fixtureRows() {
        return List.of(
                record("r01", "BREAST", "2026-10-20T08:00:00+08:00",
                        null, null, 900),
                record("r02", "BREAST", "2026-10-20T09:00:00+08:00",
                        null, null, 600),
                record("r03", "FORMULA", "2026-10-20T10:00:00+08:00",
                        ml("120"), "ML", 300),
                record("r04", "FORMULA", "2026-10-20T11:00:00+08:00",
                        ml("150"), "ML", null),
                record("r05", "MIXED", "2026-10-20T12:00:00+08:00",
                        ml("90"), "ML", 480),
                record("r06", "SOLID", "2026-10-20T13:00:00+08:00",
                        ml("30"), "G", 120),
                record("r07", "BREAST", "2026-10-20T14:00:00+08:00",
                        null, null, 1200),
                record("r08", "SOLID", "2026-10-20T15:00:00+08:00",
                        ml("20"), "G", null));
    }

    @Test
    void emptyDayReturnsContractZeros() {
        DailyStatsResponse daily = FeedingStatsAggregator.daily(
                BABY_ID, DAY, List.of());

        assertThat(daily.babyId()).isEqualTo(BABY_ID);
        assertThat(daily.date()).isEqualTo(DAY);
        assertThat(daily.feedingCount()).isZero();
        assertThat(daily.byType().keySet())
                .containsExactly("BREAST", "FORMULA", "MIXED", "SOLID");
        assertThat(daily.byType().values()).containsExactly(0, 0, 0, 0);
        assertThat(daily.totalAmountMl().toPlainString()).isEqualTo("0.0");
        assertThat(daily.totalSolidG().toPlainString()).isEqualTo("0.0");
        assertThat(daily.totalBreastDurationSec()).isZero();
        assertThat(daily.totalDurationSec()).isZero();
        assertThat(daily.avgAmountMl()).isNull();
        assertThat(daily.lastFeedingAt()).isNull();
        assertThat(daily.cached()).isFalse();

        List<TrendPoint> points = FeedingStatsAggregator.trendPoints(
                DAY, DAY.plusDays(1), List.of());
        assertThat(points).hasSize(2);
        assertThat(points.get(0).date()).isEqualTo(DAY);
        assertThat(points.get(0).feedingCount()).isZero();
        assertThat(points.get(0).totalAmountMl().toPlainString()).isEqualTo("0.0");
        assertThat(points.get(0).totalSolidG().toPlainString()).isEqualTo("0.0");
        assertThat(points.get(0).avgDurationSec()).isNull();
        assertThat(points.get(1).date()).isEqualTo(DAY.plusDays(1));
    }

    @Test
    void aggregatesFixtureExactly() {
        DailyStatsResponse daily = FeedingStatsAggregator.daily(
                BABY_ID, DAY, fixtureRows());

        assertThat(daily.feedingCount()).isEqualTo(8);
        assertThat(daily.byType().keySet())
                .containsExactly("BREAST", "FORMULA", "MIXED", "SOLID");
        assertThat(daily.byType().get("BREAST")).isEqualTo(3);
        assertThat(daily.byType().get("FORMULA")).isEqualTo(2);
        assertThat(daily.byType().get("MIXED")).isEqualTo(1);
        assertThat(daily.byType().get("SOLID")).isEqualTo(2);
        assertThat(daily.totalAmountMl().toPlainString()).isEqualTo("360.0");
        assertThat(daily.totalSolidG().toPlainString()).isEqualTo("50.0");
        assertThat(daily.totalBreastDurationSec()).isEqualTo(3180L);
        assertThat(daily.totalDurationSec()).isEqualTo(3600L);
        assertThat(daily.avgAmountMl().toPlainString()).isEqualTo("120.0");
        assertThat(daily.lastFeedingAt()).isEqualTo("2026-10-20T15:00:00+08:00");
    }

    @Test
    void lastFeedingAtKeepsRecordOffset() {
        List<FeedingRecordEntity> rows = List.of(
                record("r01", "FORMULA", "2026-10-20T23:59:59+08:00",
                        ml("120"), "ML", null),
                record("r02", "FORMULA", "2026-10-20T09:00:00-04:00",
                        ml("90"), "ML", null));

        DailyStatsResponse daily = FeedingStatsAggregator.daily(BABY_ID, DAY, rows);

        // 23:59:59+08:00 is 15:59:59Z, later than 09:00-04:00 (13:00Z).
        assertThat(daily.lastFeedingAt()).isEqualTo("2026-10-20T23:59:59+08:00");
        assertThat(daily.totalAmountMl().toPlainString()).isEqualTo("210.0");

        DailyStatsResponse other = FeedingStatsAggregator.daily(BABY_ID, DAY,
                List.of(rows.get(1)));
        assertThat(other.lastFeedingAt()).isEqualTo("2026-10-20T09:00:00-04:00");
    }

    @Test
    void trendZeroFillsMissingDatesAndGroupsByLocalDate() {
        List<FeedingRecordEntity> rows = new java.util.ArrayList<>(fixtureRows());
        rows.add(record("r09", "FORMULA", "2026-10-21T09:00:00+08:00",
                ml("120"), "ML", 300));

        List<TrendPoint> points = FeedingStatsAggregator.trendPoints(
                LocalDate.parse("2026-10-19"), LocalDate.parse("2026-10-21"), rows);

        assertThat(points).hasSize(3);
        assertThat(points.get(0).date()).isEqualTo(LocalDate.parse("2026-10-19"));
        assertThat(points.get(0).feedingCount()).isZero();
        assertThat(points.get(0).totalAmountMl().toPlainString()).isEqualTo("0.0");
        assertThat(points.get(0).avgDurationSec()).isNull();

        assertThat(points.get(1).date()).isEqualTo(DAY);
        assertThat(points.get(1).feedingCount()).isEqualTo(8);
        assertThat(points.get(1).totalAmountMl().toPlainString()).isEqualTo("360.0");
        assertThat(points.get(1).totalSolidG().toPlainString()).isEqualTo("50.0");
        assertThat(points.get(1).totalBreastDurationSec()).isEqualTo(3180L);
        assertThat(points.get(1).totalDurationSec()).isEqualTo(3600L);
        assertThat(points.get(1).avgDurationSec()).isEqualTo(600);

        assertThat(points.get(2).date()).isEqualTo(LocalDate.parse("2026-10-21"));
        assertThat(points.get(2).feedingCount()).isEqualTo(1);
        assertThat(points.get(2).totalAmountMl().toPlainString()).isEqualTo("120.0");
        assertThat(points.get(2).totalSolidG().toPlainString()).isEqualTo("0.0");
        assertThat(points.get(2).totalDurationSec()).isEqualTo(300L);
        assertThat(points.get(2).avgDurationSec()).isEqualTo(300);
    }

    @Test
    void averageDurationUsesHalfUpAndIgnoresRowsWithoutDuration() {
        List<FeedingRecordEntity> threeOf101 = List.of(
                record("r01", "FORMULA", "2026-10-01T08:00:00+08:00",
                        ml("120"), "ML", 100),
                record("r02", "FORMULA", "2026-10-01T09:00:00+08:00",
                        ml("120"), "ML", 101),
                record("r03", "FORMULA", "2026-10-01T10:00:00+08:00",
                        ml("120"), "ML", 101),
                record("r04", "FORMULA", "2026-10-01T11:00:00+08:00",
                        ml("120"), "ML", null));
        TrendPoint point = FeedingStatsAggregator.trendPoints(
                LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-01"),
                threeOf101).get(0);
        // (100 + 101 + 101) / 3 = 100.67 -> 101
        assertThat(point.avgDurationSec()).isEqualTo(101);
        assertThat(point.totalDurationSec()).isEqualTo(302L);

        List<FeedingRecordEntity> pair = List.of(
                record("r05", "FORMULA", "2026-10-02T08:00:00+08:00",
                        ml("120"), "ML", 100),
                record("r06", "FORMULA", "2026-10-02T09:00:00+08:00",
                        ml("120"), "ML", 101));
        TrendPoint half = FeedingStatsAggregator.trendPoints(
                LocalDate.parse("2026-10-02"), LocalDate.parse("2026-10-02"),
                pair).get(0);
        // 100.5 HALF_UP -> 101 (HALF_EVEN would yield 100)
        assertThat(half.avgDurationSec()).isEqualTo(101);
    }

    @Test
    void averageAmountUsesOneDecimalHalfUp() {
        List<FeedingRecordEntity> rows = List.of(
                record("r01", "FORMULA", "2026-10-03T08:00:00+08:00",
                        ml("100"), "ML", null),
                record("r02", "FORMULA", "2026-10-03T09:00:00+08:00",
                        ml("100"), "ML", null),
                record("r03", "FORMULA", "2026-10-03T10:00:00+08:00",
                        ml("100"), "ML", null),
                record("r04", "FORMULA", "2026-10-03T11:00:00+08:00",
                        ml("101"), "ML", null));

        DailyStatsResponse daily = FeedingStatsAggregator.daily(
                BABY_ID, LocalDate.parse("2026-10-03"), rows);

        // 100.25 HALF_UP -> 100.3 (HALF_EVEN would yield 100.2)
        assertThat(daily.avgAmountMl().toPlainString()).isEqualTo("100.3");
        assertThat(daily.totalAmountMl().toPlainString()).isEqualTo("401.0");
    }
}
