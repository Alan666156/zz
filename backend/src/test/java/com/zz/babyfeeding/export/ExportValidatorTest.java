package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExportValidatorTest {

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    @Test
    void parsesStrictIsoLocalDates() {
        assertThat(ExportValidator.parseDate("from", "2026-10-20"))
                .isEqualTo(LocalDate.parse("2026-10-20"));
        assertFieldError(() -> ExportValidator.parseDate("from", null), "from");
        assertFieldError(() -> ExportValidator.parseDate("from", "  "), "from");
        assertFieldError(() -> ExportValidator.parseDate("from", "2026/10/20"), "from");
        assertFieldError(() -> ExportValidator.parseDate("to", "2026-13-01"), "to");
    }

    @Test
    void accepts366InclusiveDaysAndRejects367() {
        ExportValidator.validateRange(
                LocalDate.parse("2025-10-20"), LocalDate.parse("2026-10-20"));
        ExportValidator.validateRange(
                LocalDate.parse("2026-10-20"), LocalDate.parse("2026-10-20"));

        assertFieldError(() -> ExportValidator.validateRange(
                LocalDate.parse("2025-10-19"), LocalDate.parse("2026-10-20")), "from");
    }

    @Test
    void rejectsReversedRange() {
        assertFieldError(() -> ExportValidator.validateRange(
                LocalDate.parse("2026-10-21"), LocalDate.parse("2026-10-20")), "from");
    }
}
