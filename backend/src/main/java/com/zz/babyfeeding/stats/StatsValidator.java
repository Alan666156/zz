package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.common.api.ValidationExceptions;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

/**
 * Statistics query rules (contract 4.7): strict YYYY-MM-DD dates and a
 * 90-day inclusive trend window.
 */
public final class StatsValidator {

    public static final int MAX_TREND_DAYS = 90;

    private StatsValidator() {
    }

    /** Daily date is mandatory; a missing or malformed value is a field error. */
    public static LocalDate parseRequiredDate(String field, String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field(field, field + " 必填");
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 YYYY-MM-DD");
        }
    }

    public static void validateTrendRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw ValidationExceptions.field("from", "from 不能晚于 to");
        }
        long spanDays = ChronoUnit.DAYS.between(from, to) + 1;
        if (spanDays > MAX_TREND_DAYS) {
            throw ValidationExceptions.field("from", "趋势查询跨度不能超过 90 天");
        }
    }
}
