package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StatsValidatorTest {

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    @Test
    void parsesOnlyStrictLocalDates() {
        assertThat(StatsValidator.parseRequiredDate("date", "2026-10-20"))
                .isEqualTo(LocalDate.parse("2026-10-20"));
        assertFieldError(() -> StatsValidator.parseRequiredDate("date", null), "date");
        assertFieldError(() -> StatsValidator.parseRequiredDate("date", "  "), "date");
        assertFieldError(() -> StatsValidator.parseRequiredDate("date", "2026-13-01"), "date");
        assertFieldError(() -> StatsValidator.parseRequiredDate("date", "2026/10/20"), "date");
        assertFieldError(() -> StatsValidator.parseRequiredDate("from", "2026-1-1"), "from");
    }

    @Test
    void acceptsInclusiveNinetyDayWindow() {
        LocalDate from = LocalDate.parse("2026-01-01");
        LocalDate to = LocalDate.parse("2026-03-31");
        StatsValidator.validateTrendRange(from, to);
        StatsValidator.validateTrendRange(from, from);
        StatsValidator.validateTrendRange(
                LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-01"));
    }

    @Test
    void rejectsReversedAndOverNinetyDayWindows() {
        assertFieldError(() -> StatsValidator.validateTrendRange(
                LocalDate.parse("2026-10-21"), LocalDate.parse("2026-10-20")), "from");
        assertFieldError(() -> StatsValidator.validateTrendRange(
                LocalDate.parse("2025-12-31"), LocalDate.parse("2026-03-31")), "from");
    }
}
