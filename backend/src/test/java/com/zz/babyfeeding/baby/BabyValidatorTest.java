package com.zz.babyfeeding.baby;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BabyValidatorTest {

    private static final LocalDate TODAY = LocalDate.parse("2026-10-26");

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    @Test
    void trimsAndAcceptsName() {
        assertThat(BabyValidator.normalizeName("  小满  ")).isEqualTo("小满");
        assertThat(BabyValidator.normalizeName("a b")).isEqualTo("a b");
    }

    @Test
    void countsUnicodeCodePointsNotUtf16Units() {
        String twentyEmoji = "😀".repeat(20);
        assertThat(twentyEmoji.length()).isEqualTo(40);
        assertThat(BabyValidator.normalizeName(twentyEmoji)).isEqualTo(twentyEmoji);

        assertFieldError(() -> BabyValidator.normalizeName("😀".repeat(21)), "name");
    }

    @Test
    void rejectsBlankTooLongAndControlCharacters() {
        assertFieldError(() -> BabyValidator.normalizeName(null), "name");
        assertFieldError(() -> BabyValidator.normalizeName("   "), "name");
        assertFieldError(() -> BabyValidator.normalizeName("a".repeat(21)), "name");
        assertFieldError(() -> BabyValidator.normalizeName("小\u0000满"), "name");
    }

    @Test
    void normalisesGender() {
        assertThat(BabyValidator.normalizeGender(null)).isEqualTo("UNKNOWN");
        assertThat(BabyValidator.normalizeGender("")).isEqualTo("UNKNOWN");
        assertThat(BabyValidator.normalizeGender("female")).isEqualTo("FEMALE");
        assertFieldError(() -> BabyValidator.normalizeGender("OTHER"), "gender");
    }

    @Test
    void validatesBirthDateWindow() {
        BabyValidator.validateBirthDate(TODAY, TODAY);
        BabyValidator.validateBirthDate(TODAY.minusYears(3), TODAY);

        assertFieldError(() -> BabyValidator.validateBirthDate(TODAY.plusDays(1), TODAY),
                "birthDate");
        assertFieldError(() ->
                BabyValidator.validateBirthDate(TODAY.minusYears(3).minusDays(1), TODAY),
                "birthDate");
        assertFieldError(() -> BabyValidator.validateBirthDate(null, TODAY), "birthDate");
    }

    @Test
    void normalisesIdsAndRequiresBaseRevision() {
        String generated = BabyValidator.normalizeId(null);
        assertThat(generated).matches("[0-9a-f-]{36}");
        assertThat(BabyValidator.normalizeId("F47AC10B-58CC-4372-A567-0E02B2C3D479"))
                .isEqualTo("f47ac10b-58cc-4372-a567-0e02b2c3d479");
        assertFieldError(() -> BabyValidator.normalizeId("not-a-uuid"), "id");

        BabyValidator.requireBaseRevision(1);
        assertFieldError(() -> BabyValidator.requireBaseRevision(null), "baseRevision");
        assertFieldError(() -> BabyValidator.requireBaseRevision(0), "baseRevision");
    }
}
