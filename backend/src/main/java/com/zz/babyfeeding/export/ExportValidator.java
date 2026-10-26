package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.api.ValidationExceptions;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.Map;

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
            // Q-27: span is an export resource limit, not a field format
            // error. The row count is not queried yet, so the payload carries
            // only the span variant of the EXPORT_TOO_LARGE data.
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("maxDays", MAX_RANGE_DAYS);
            data.put("from", from.toString());
            data.put("to", to.toString());
            data.put("spanDays", spanDays);
            throw new BusinessException(ErrorCode.EXPORT_TOO_LARGE, data);
        }
    }
}
