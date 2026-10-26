package com.zz.babyfeeding.growth;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.common.api.ValidationExceptions;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/**
 * Growth metric rules (contract 4.8 / addendum Q-02): at least one metric,
 * per-metric precision and range, and the measuredOn window
 * [baby.birthDate, todayUtc + 1 day] (Q-11).
 */
public final class GrowthValidator {

    public static final BigDecimal HEIGHT_MIN = new BigDecimal("20");
    public static final BigDecimal HEIGHT_MAX = new BigDecimal("150");
    public static final BigDecimal WEIGHT_MIN = new BigDecimal("0.5");
    public static final BigDecimal WEIGHT_MAX = new BigDecimal("50");
    public static final BigDecimal HEAD_MIN = new BigDecimal("20");
    public static final BigDecimal HEAD_MAX = new BigDecimal("70");
    public static final int MAX_NOTE_CODE_POINTS = 200;

    private GrowthValidator() {
    }

    /** Accepts only JSON numbers; rejects numeric strings and booleans. */
    public static BigDecimal parseMetric(String field, JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isNumber()) {
            throw ValidationExceptions.field(field, field + " 必须是数字");
        }
        return node.decimalValue();
    }

    public static LocalDate parseMeasuredOn(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field("measuredOn", "measuredOn 必填");
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field("measuredOn", "measuredOn 必须是 YYYY-MM-DD");
        }
    }

    public static LocalDate parseQueryDate(String field, String raw) {
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 YYYY-MM-DD");
        }
    }

    public static String parseNote(String raw) {
        if (raw == null) {
            return null;
        }
        if (raw.codePointCount(0, raw.length()) > MAX_NOTE_CODE_POINTS) {
            throw ValidationExceptions.field("note", "备注最多 200 个字符");
        }
        return raw;
    }

    /** Precision is checked before range so 68.55 reports heightCm, not a range error. */
    public static void validateMetrics(BigDecimal heightCm,
                                       BigDecimal weightKg,
                                       BigDecimal headCircumferenceCm) {
        validatePrecision("heightCm", heightCm, 1);
        validatePrecision("weightKg", weightKg, 2);
        validatePrecision("headCircumferenceCm", headCircumferenceCm, 1);

        if (heightCm != null) {
            validateRange("heightCm", heightCm, HEIGHT_MIN, HEIGHT_MAX, "身高必须在 20-150 cm");
        }
        if (weightKg != null) {
            validateRange("weightKg", weightKg, WEIGHT_MIN, WEIGHT_MAX, "体重必须在 0.5-50 kg");
        }
        if (headCircumferenceCm != null) {
            validateRange("headCircumferenceCm", headCircumferenceCm,
                    HEAD_MIN, HEAD_MAX, "头围必须在 20-70 cm");
        }

        if (heightCm == null && weightKg == null && headCircumferenceCm == null) {
            throw ValidationExceptions.field("metrics",
                    "至少提供身高、体重、头围中的一项");
        }
    }

    public static void validateMeasuredOn(LocalDate measuredOn,
                                          LocalDate birthDate,
                                          LocalDate todayUtc) {
        if (measuredOn.isBefore(birthDate)) {
            throw ValidationExceptions.field("measuredOn", "测量日期不能早于宝宝出生日期");
        }
        if (measuredOn.isAfter(todayUtc.plusDays(1))) {
            throw ValidationExceptions.field("measuredOn", "测量日期不能晚于明天");
        }
    }

    public static void validateRange(String field, LocalDate from, LocalDate to) {
        if (from.isAfter(to)) {
            throw ValidationExceptions.field("from", "from 不能晚于 to");
        }
        long spanDays = java.time.temporal.ChronoUnit.DAYS.between(from, to) + 1;
        if (spanDays > 366) {
            throw ValidationExceptions.field("from", "查询跨度不能超过 366 天");
        }
    }

    /** API scale: height/head one decimal, weight two (Q-02). */
    public static BigDecimal heightScale(BigDecimal value) {
        return value == null ? null : value.setScale(1, java.math.RoundingMode.HALF_UP);
    }

    public static BigDecimal weightScale(BigDecimal value) {
        return value == null ? null : value.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private static void validatePrecision(String field, BigDecimal value, int maxScale) {
        if (value != null && value.stripTrailingZeros().scale() > maxScale) {
            throw ValidationExceptions.field(field,
                    field + " 最多 " + maxScale + " 位小数");
        }
    }

    private static void validateRange(String field, BigDecimal value,
                                      BigDecimal min, BigDecimal max, String message) {
        if (value.compareTo(min) < 0 || value.compareTo(max) > 0) {
            throw ValidationExceptions.field(field, message);
        }
    }
}
