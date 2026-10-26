package com.zz.babyfeeding.feeding;

import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.common.api.ValidationExceptions;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Feeding-record validation that Bean Validation cannot express: the
 * per-type matrix (contract 4.6), offset-aware timestamps, note length and the
 * tag enum/order rules (Q-03).
 */
public final class FeedingValidator {

    public static final int MAX_NOTE_CODE_POINTS = 200;
    public static final int MAX_DURATION_SEC = 21_600;
    public static final int MAX_TAGS = 5;
    public static final int MAX_QUERY_RANGE_DAYS = 92;
    public static final BigDecimal MAX_MILK_ML = new BigDecimal("500");
    public static final BigDecimal MAX_SOLID_G = new BigDecimal("2000");

    private FeedingValidator() {
    }

    // -------------------------------------------------------------- parsing

    /** Accepts only JSON numbers; numeric strings are rejected (FEED-23). */
    public static BigDecimal parseAmount(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isNumber()) {
            throw ValidationExceptions.field("amountValue", "喂养量必须是数字");
        }
        return node.decimalValue();
    }

    public static OffsetDateTime parseStartedAt(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field("startedAt", "startedAt 必填");
        }
        return parseOffset("startedAt", raw);
    }

    public static OffsetDateTime parseEndedAtNullable(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return parseOffset("endedAt", raw);
    }

    private static OffsetDateTime parseOffset(String field, String raw) {
        try {
            return OffsetDateTime.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field(field,
                    field + " 必须是带时区偏移的 ISO-8601 时间");
        }
    }

    public static LocalDate parseQueryDate(String field, String raw) {
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException | NullPointerException ex) {
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

    /** Deduplicates, validates and sorts tags into enum declaration order. */
    public static List<FeedingTag> parseTags(List<String> raw) {
        if (raw == null) {
            return null;
        }
        LinkedHashSet<FeedingTag> unique = new LinkedHashSet<>();
        for (String code : raw) {
            if (code == null) {
                throw ValidationExceptions.field("tags", "标签不能为空");
            }
            try {
                unique.add(FeedingTag.valueOf(code));
            } catch (IllegalArgumentException ex) {
                throw ValidationExceptions.field("tags", "未知标签: " + code);
            }
        }
        if (unique.size() > MAX_TAGS) {
            throw ValidationExceptions.field("tags", "标签最多 5 个");
        }
        return unique.stream()
                .sorted((left, right) -> left.ordinal() - right.ordinal())
                .toList();
    }

    // ----------------------------------------------------------- validation

    public static void validateMatrix(FeedingType type,
                                      BreastSide breastSide,
                                      BigDecimal amountValue,
                                      AmountUnit amountUnit,
                                      Integer durationSec) {
        if (amountValue != null && amountValue.stripTrailingZeros().scale() > 1) {
            throw ValidationExceptions.field("amountValue", "喂养量最多 1 位小数");
        }
        switch (type) {
            case BREAST -> {
                requireBreastSide(breastSide);
                if (amountValue != null) {
                    throw ValidationExceptions.field("amountValue", "母乳记录不能填写喂养量");
                }
                if (amountUnit != null) {
                    throw ValidationExceptions.field("amountUnit", "母乳记录不能填写单位");
                }
                requireDuration(durationSec);
            }
            case FORMULA -> {
                rejectBreastSide(breastSide);
                requireMilkAmount(amountValue, amountUnit);
                optionalDuration(durationSec);
            }
            case MIXED -> {
                requireBreastSide(breastSide);
                requireMilkAmount(amountValue, amountUnit);
                requireDuration(durationSec);
            }
            case SOLID -> {
                rejectBreastSide(breastSide);
                if (amountValue == null) {
                    if (amountUnit != null) {
                        throw ValidationExceptions.field("amountUnit",
                                "未填写辅食量时不能填写单位");
                    }
                } else {
                    if (amountUnit != AmountUnit.G) {
                        throw ValidationExceptions.field("amountUnit", "辅食单位必须是 G");
                    }
                    if (amountValue.compareTo(BigDecimal.ZERO) <= 0
                            || amountValue.compareTo(MAX_SOLID_G) > 0) {
                        throw ValidationExceptions.field("amountValue",
                                "辅食量必须大于 0 且不超过 2000 g");
                    }
                }
                optionalDuration(durationSec);
            }
        }
    }

    public static void validateTimes(OffsetDateTime startedAt,
                                     OffsetDateTime endedAt,
                                     LocalDate birthDate,
                                     Instant now) {
        if (startedAt == null) {
            throw ValidationExceptions.field("startedAt", "startedAt 必填");
        }
        if (startedAt.toLocalDate().isBefore(birthDate)) {
            throw ValidationExceptions.field("startedAt", "开始时间不能早于宝宝出生日期");
        }
        if (startedAt.toInstant().isAfter(now.plus(5, ChronoUnit.MINUTES))) {
            throw ValidationExceptions.field("startedAt", "开始时间不能晚于当前时间 5 分钟");
        }
        if (endedAt != null) {
            if (endedAt.toInstant().isBefore(startedAt.toInstant())) {
                throw ValidationExceptions.field("endedAt", "结束时间不能早于开始时间");
            }
            if (Duration.between(startedAt, endedAt).compareTo(Duration.ofHours(6)) > 0) {
                throw ValidationExceptions.field("endedAt", "单次喂养时长不能超过 6 小时");
            }
        }
    }

    /** Trims insignificant zeroes so JSON echoes 120 rather than 120.00. */
    public static BigDecimal normalizeAmount(BigDecimal value) {
        if (value == null) {
            return null;
        }
        BigDecimal stripped = value.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }

    private static void requireBreastSide(BreastSide breastSide) {
        if (breastSide == null) {
            throw ValidationExceptions.field("breastSide", "breastSide 必填");
        }
    }

    private static void rejectBreastSide(BreastSide breastSide) {
        if (breastSide != null) {
            throw ValidationExceptions.field("breastSide", "该喂养类型不能填写 breastSide");
        }
    }

    private static void requireMilkAmount(BigDecimal amountValue, AmountUnit amountUnit) {
        if (amountValue == null) {
            throw ValidationExceptions.field("amountValue", "奶量必填");
        }
        if (amountValue.compareTo(BigDecimal.ZERO) <= 0
                || amountValue.compareTo(MAX_MILK_ML) > 0) {
            throw ValidationExceptions.field("amountValue", "奶量必须大于 0 且不超过 500 ml");
        }
        if (amountUnit != AmountUnit.ML) {
            throw ValidationExceptions.field("amountUnit", "奶量单位必须是 ML");
        }
    }

    private static void requireDuration(Integer durationSec) {
        if (durationSec == null) {
            throw ValidationExceptions.field("durationSec", "durationSec 必填");
        }
        checkDurationRange(durationSec);
        if (durationSec < 1) {
            throw ValidationExceptions.field("durationSec", "durationSec 必须大于 0");
        }
    }

    private static void optionalDuration(Integer durationSec) {
        if (durationSec != null) {
            checkDurationRange(durationSec);
        }
    }

    private static void checkDurationRange(int durationSec) {
        if (durationSec < 0 || durationSec > MAX_DURATION_SEC) {
            throw ValidationExceptions.field("durationSec",
                    "durationSec 必须在 0-21600 秒之间");
        }
    }
}
