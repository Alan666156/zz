package com.zz.babyfeeding.common.util;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class TimeUtilsTest {

    @Test
    void derivesRecordDateFromClientOffset() {
        OffsetDateTime lateEvening = OffsetDateTime.parse("2026-10-26T23:59:59+08:00");

        assertThat(TimeUtils.recordDate(lateEvening)).isEqualTo(LocalDate.parse("2026-10-26"));
        assertThat(TimeUtils.tzOffsetMinutes(lateEvening)).isEqualTo(480);
        assertThat(TimeUtils.toUtc(lateEvening))
                .isEqualTo(LocalDateTime.parse("2026-10-26T15:59:59"));
    }

    @Test
    void acrossMidnightKeepsLocalDateButStoresPreviousUtcDay() {
        OffsetDateTime afterMidnight = OffsetDateTime.parse("2026-10-27T00:00:01+08:00");

        assertThat(TimeUtils.recordDate(afterMidnight)).isEqualTo(LocalDate.parse("2026-10-27"));
        assertThat(TimeUtils.toUtc(afterMidnight))
                .isEqualTo(LocalDateTime.parse("2026-10-26T16:00:01"));
    }

    @Test
    void restoresOriginalOffsetFromUtc() {
        OffsetDateTime restored = TimeUtils.fromUtc(
                LocalDateTime.parse("2026-10-26T15:59:59"), 480);

        assertThat(restored).isEqualTo(OffsetDateTime.parse("2026-10-26T23:59:59+08:00"));
    }

    @Test
    void parsesLocalDatesAndFormatsServerTime() {
        assertThat(TimeUtils.parseDate("2026-10-26")).isEqualTo(LocalDate.parse("2026-10-26"));
        assertThat(TimeUtils.serverTime())
                .matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
    }
}
