package com.zz.babyfeeding.stats.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * One day of the trend series. avgDurationSec is null when no record that day
 * carries a duration (contract 4.7).
 */
public record TrendPoint(
        LocalDate date,
        int feedingCount,
        BigDecimal totalAmountMl,
        BigDecimal totalSolidG,
        long totalBreastDurationSec,
        long totalDurationSec,
        Integer avgDurationSec
) {
}
