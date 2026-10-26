package com.zz.babyfeeding.stats.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

/**
 * Daily statistics (contract 4.7). Totals and the amount average use one
 * decimal place (Q-10); byType always contains all four feeding types.
 */
public record DailyStatsResponse(
        String babyId,
        LocalDate date,
        int feedingCount,
        Map<String, Integer> byType,
        BigDecimal totalAmountMl,
        BigDecimal totalSolidG,
        long totalBreastDurationSec,
        long totalDurationSec,
        BigDecimal avgAmountMl,
        String lastFeedingAt,
        boolean cached
) {

    /** Cached copies are returned with the hit flag set; the stored copy stays false. */
    public DailyStatsResponse withCached(boolean value) {
        return new DailyStatsResponse(babyId, date, feedingCount, byType,
                totalAmountMl, totalSolidG, totalBreastDurationSec, totalDurationSec,
                avgAmountMl, lastFeedingAt, value);
    }
}
