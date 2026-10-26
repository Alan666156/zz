package com.zz.babyfeeding.baby;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.util.UuidUtils;

import java.time.LocalDate;
import java.util.Locale;
import java.util.Set;

/**
 * Baby-specific validation that Bean Validation cannot express directly:
 * Unicode code-point length, control characters and the 3-year birth date
 * window.
 */
public final class BabyValidator {

    public static final int MAX_NAME_CODE_POINTS = 20;
    public static final int MAX_AGE_YEARS = 3;
    public static final Set<String> GENDERS = Set.of("MALE", "FEMALE", "UNKNOWN");

    private BabyValidator() {
    }

    public static String normalizeName(String rawName) {
        if (rawName == null) {
            throw ValidationExceptions.field("name", "昵称不能为空");
        }
        String name = rawName.strip();
        if (name.isEmpty()) {
            throw ValidationExceptions.field("name", "昵称不能为空");
        }
        int codePoints = name.codePointCount(0, name.length());
        if (codePoints > MAX_NAME_CODE_POINTS) {
            throw ValidationExceptions.field("name", "昵称最多 20 个字符");
        }
        if (name.codePoints().anyMatch(Character::isISOControl)) {
            throw ValidationExceptions.field("name", "昵称不能包含控制字符");
        }
        return name;
    }

    public static String normalizeGender(String rawGender) {
        if (rawGender == null || rawGender.isBlank()) {
            return "UNKNOWN";
        }
        String gender = rawGender.trim().toUpperCase(Locale.ROOT);
        if (!GENDERS.contains(gender)) {
            throw ValidationExceptions.field("gender", "性别必须是 MALE/FEMALE/UNKNOWN");
        }
        return gender;
    }

    public static void validateBirthDate(LocalDate birthDate, LocalDate todayUtc) {
        if (birthDate == null) {
            throw ValidationExceptions.field("birthDate", "出生日期不能为空");
        }
        // One-day tolerance on both ends covers client timezones up to UTC+14
        // (contract addendum Q-11).
        if (birthDate.isAfter(todayUtc.plusDays(1))) {
            throw ValidationExceptions.field("birthDate", "出生日期不能晚于明天");
        }
        if (birthDate.isBefore(todayUtc.minusYears(MAX_AGE_YEARS).minusDays(1))) {
            throw ValidationExceptions.field("birthDate", "出生日期不能早于 3 年前（含 1 天容差）");
        }
    }

    public static String normalizeId(String rawId) {
        if (rawId == null) {
            return UuidUtils.newUuidV4();
        }
        if (!UuidUtils.isUuidV4(rawId)) {
            throw ValidationExceptions.field("id", "id 必须是 UUID v4");
        }
        return rawId;
    }

    /** Path ids must be exact lower-case canonical UUID v4 (Q-13). */
    public static void requireUuidV4(String field, String value) {
        if (!UuidUtils.isUuidV4(value)) {
            throw ValidationExceptions.field(field, field + " 必须是 UUID v4");
        }
    }

    public static void requireBaseRevision(Integer baseRevision) {
        if (baseRevision == null) {
            throw ValidationExceptions.field("baseRevision", "baseRevision 必填");
        }
        if (baseRevision < 0) {
            throw ValidationExceptions.field("baseRevision", "baseRevision 不能为负数");
        }
        // 0 is syntactically valid: it can never match an existing revision and
        // therefore resolves to 409 CONFLICT on PATCH/DELETE (BABY-13).
    }

    public static BusinessException notFound() {
        return new BusinessException(com.zz.babyfeeding.common.api.ErrorCode.NOT_FOUND);
    }
}
