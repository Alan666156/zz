package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;

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
        // 2025-10-20..2026-10-20 is exactly 366 inclusive days: allowed.
        ExportValidator.validateRange(
                LocalDate.parse("2025-10-20"), LocalDate.parse("2026-10-20"));
        ExportValidator.validateRange(
                LocalDate.parse("2026-10-20"), LocalDate.parse("2026-10-20"));

        // One more day is a resource limit, not a field error (Q-27).
        assertThatThrownBy(() -> ExportValidator.validateRange(
                LocalDate.parse("2025-10-19"), LocalDate.parse("2026-10-20")))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.EXPORT_TOO_LARGE);
                    assertThat(ex.getData()).isEqualTo(Map.of(
                            "maxDays", ExportValidator.MAX_RANGE_DAYS,
                            "from", "2025-10-19",
                            "to", "2026-10-20",
                            "spanDays", 367L));
                });
    }

    @Test
    @SuppressWarnings("unchecked")
    void spanTooLargePayloadHasOnlyTheSpanVariant() {
        assertThatThrownBy(() -> ExportValidator.validateRange(
                LocalDate.parse("2024-01-01"), LocalDate.parse("2025-01-01")))
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.EXPORT_TOO_LARGE);
                    assertThat(ex.getData()).isInstanceOf(Map.class);
                    Map<String, Object> data = (Map<String, Object>) ex.getData();
                    assertThat(data).containsOnlyKeys("maxDays", "from", "to", "spanDays");
                    assertThat(data.get("from")).isEqualTo("2024-01-01");
                    assertThat(data.get("to")).isEqualTo("2025-01-01");
                    assertThat(data.get("spanDays")).isEqualTo(367L);
                });
    }

    @Test
    void rejectsReversedRange() {
        assertFieldError(() -> ExportValidator.validateRange(
                LocalDate.parse("2026-10-21"), LocalDate.parse("2026-10-20")), "from");
    }
}
