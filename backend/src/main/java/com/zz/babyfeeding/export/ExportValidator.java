package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.api.ValidationExceptions;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

/** Export request rules (contract 4.9): strict dates, ordered 366-day window. */
public final class ExportValidator {

    public static final int MAX_RANGE_DAYS = 366;
    public static final int MAX_ROWS = 10_000;

    private ExportValidator() {
    }

    public static LocalDate parseDate(String field, String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field(field, field + " 必填");
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 YYYY-MM-DD");
        }
    }

    public static void validateRange(LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw ValidationExceptions.field("from", "from 不能晚于 to");
        }
        long spanDays = ChronoUnit.DAYS.between(from, to) + 1;
        if (spanDays > MAX_RANGE_DAYS) {
            throw ValidationExceptions.field("from", "导出跨度不能超过 366 天");
        }
    }
}
