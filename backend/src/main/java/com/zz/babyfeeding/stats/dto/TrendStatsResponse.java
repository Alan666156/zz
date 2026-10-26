package com.zz.babyfeeding.stats.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Daily-granularity trend over an inclusive date range. Missing dates are
 * zero-filled so the series always has one point per day (contract 4.7).
 */
public record TrendStatsResponse(
        String babyId,
        LocalDate from,
        LocalDate to,
        String granularity,
        List<TrendPoint> points,
        boolean cached
) {

    public static final String GRANULARITY_DAY = "DAY";

    public TrendStatsResponse withCached(boolean value) {
        return new TrendStatsResponse(babyId, from, to, granularity, points, value);
    }
}
