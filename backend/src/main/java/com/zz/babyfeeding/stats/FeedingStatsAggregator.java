package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.feeding.FeedingRecordEntity;
import com.zz.babyfeeding.feeding.FeedingType;
import com.zz.babyfeeding.stats.dto.DailyStatsResponse;
import com.zz.babyfeeding.stats.dto.TrendPoint;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Pure aggregation of active feeding rows into the statistics contract
 * (contract 4.7, addendum Q-10). All arithmetic uses BigDecimal with HALF_UP;
 * double is never involved. Grouping uses the server-derived recordDate, so a
 * record belongs to its original local date, not to UTC.
 */
public final class FeedingStatsAggregator {

    private static final BigDecimal ZERO_ONE_DECIMAL = BigDecimal.ZERO.setScale(1);

    private FeedingStatsAggregator() {
    }

    public static DailyStatsResponse daily(String babyId,
                                           LocalDate date,
                                           List<FeedingRecordEntity> rows) {
        Map<String, Integer> byType = new LinkedHashMap<>();
        for (FeedingType type : FeedingType.values()) {
            byType.put(type.name(), 0);
        }

        BigDecimal amountTotal = BigDecimal.ZERO;
        BigDecimal solidTotal = BigDecimal.ZERO;
        int amountCount = 0;
        long breastDuration = 0L;
        long totalDuration = 0L;
        FeedingRecordEntity last = null;

        for (FeedingRecordEntity row : rows) {
            String type = row.getFeedType();
            if (byType.containsKey(type)) {
                byType.merge(type, 1, Integer::sum);
            }

            Integer duration = row.getDurationSec();
            if (duration != null) {
                totalDuration += duration;
                if (isBreastType(type)) {
                    breastDuration += duration;
                }
            }

            BigDecimal amount = row.getAmountValue();
            if (amount != null) {
                if (isMilkType(type)) {
                    amountTotal = amountTotal.add(amount);
                    amountCount++;
                } else if (FeedingType.SOLID.name().equals(type)) {
                    solidTotal = solidTotal.add(amount);
                }
            }

            if (last == null || isLater(row, last)) {
                last = row;
            }
        }

        BigDecimal avgAmount = amountCount == 0 ? null
                : amountTotal.divide(BigDecimal.valueOf(amountCount), 1, RoundingMode.HALF_UP);
        String lastFeedingAt = last == null
                ? null
                : TimeUtils.formatOffset(TimeUtils.fromUtc(
                        last.getStartedAt(), last.getTzOffsetMinutes()));

        return new DailyStatsResponse(
                babyId,
                date,
                rows.size(),
                byType,
                scaleOne(amountTotal),
                scaleOne(solidTotal),
                breastDuration,
                totalDuration,
                avgAmount,
                lastFeedingAt,
                false);
    }

    public static List<TrendPoint> trendPoints(LocalDate from,
                                               LocalDate to,
                                               List<FeedingRecordEntity> rows) {
        Map<LocalDate, DayBucket> buckets = new HashMap<>();
        for (FeedingRecordEntity row : rows) {
            LocalDate bucketDate = row.getRecordDate();
            if (bucketDate == null || bucketDate.isBefore(from) || bucketDate.isAfter(to)) {
                continue;
            }
            buckets.computeIfAbsent(bucketDate, ignored -> new DayBucket()).add(row);
        }

        List<TrendPoint> points = new ArrayList<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            DayBucket bucket = buckets.get(date);
            points.add(bucket == null ? emptyPoint(date) : bucket.toPoint(date));
        }
        return points;
    }

    private static boolean isLater(FeedingRecordEntity candidate, FeedingRecordEntity current) {
        int byStartedAt = candidate.getStartedAt().compareTo(current.getStartedAt());
        if (byStartedAt != 0) {
            return byStartedAt > 0;
        }
        return candidate.getId().compareTo(current.getId()) > 0;
    }

    private static boolean isMilkType(String type) {
        return FeedingType.FORMULA.name().equals(type)
                || FeedingType.MIXED.name().equals(type);
    }

    private static boolean isBreastType(String type) {
        return FeedingType.BREAST.name().equals(type)
                || FeedingType.MIXED.name().equals(type);
    }

    private static BigDecimal scaleOne(BigDecimal value) {
        return value.setScale(1, RoundingMode.HALF_UP);
    }

    private static TrendPoint emptyPoint(LocalDate date) {
        return new TrendPoint(date, 0, ZERO_ONE_DECIMAL, ZERO_ONE_DECIMAL,
                0L, 0L, null);
    }

    private static final class DayBucket {

        private int feedingCount;
        private BigDecimal amountTotal = BigDecimal.ZERO;
        private BigDecimal solidTotal = BigDecimal.ZERO;
        private long breastDuration;
        private long totalDuration;
        private int durationCount;

        void add(FeedingRecordEntity row) {
            feedingCount++;

            String type = row.getFeedType();
            BigDecimal amount = row.getAmountValue();
            if (amount != null) {
                if (isMilkType(type)) {
                    amountTotal = amountTotal.add(amount);
                } else if (FeedingType.SOLID.name().equals(type)) {
                    solidTotal = solidTotal.add(amount);
                }
            }

            Integer duration = row.getDurationSec();
            if (duration != null) {
                totalDuration += duration;
                durationCount++;
                if (isBreastType(type)) {
                    breastDuration += duration;
                }
            }
        }

        TrendPoint toPoint(LocalDate date) {
            Integer avgDuration = durationCount == 0 ? null
                    : BigDecimal.valueOf(totalDuration)
                            .divide(BigDecimal.valueOf(durationCount), 0, RoundingMode.HALF_UP)
                            .intValueExact();
            return new TrendPoint(date, feedingCount, scaleOne(amountTotal),
                    scaleOne(solidTotal), breastDuration, totalDuration, avgDuration);
        }
    }
}
