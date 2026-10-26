package com.zz.babyfeeding.common.util;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * Time helpers. Storage is UTC; record-local dates are derived from the client
 * supplied offset, never from the server's local time zone.
 */
public final class TimeUtils {

    public static final ZoneOffset UTC = ZoneOffset.UTC;

    private static final DateTimeFormatter SERVER_TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(UTC);

    private TimeUtils() {
    }

    public static Instant now() {
        return Instant.now().truncatedTo(ChronoUnit.MILLIS);
    }

    /** Always formatted as an ISO-8601 UTC timestamp with millisecond precision. */
    public static String serverTime() {
        return SERVER_TIME_FORMAT.format(Instant.now());
    }

    public static String formatInstant(Instant instant) {
        return instant == null ? null : SERVER_TIME_FORMAT.format(instant);
    }

    /** Converts an offset-aware timestamp (e.g. +08:00) to a UTC LocalDateTime. */
    public static LocalDateTime toUtc(OffsetDateTime value) {
        return value.withOffsetSameInstant(UTC).toLocalDateTime();
    }

    /** Local date in the timestamp's own offset, used as the statistics bucket. */
    public static LocalDate recordDate(OffsetDateTime value) {
        return value.toLocalDate();
    }

    /** Offset in minutes, e.g. +08:00 -> 480. */
    public static int tzOffsetMinutes(OffsetDateTime value) {
        return value.getOffset().getTotalSeconds() / 60;
    }

    /** Restores a UTC LocalDateTime plus the stored offset to an offset-aware value. */
    public static OffsetDateTime fromUtc(LocalDateTime utc, int tzOffsetMinutes) {
        return utc.atOffset(UTC)
                .withOffsetSameInstant(ZoneOffset.ofTotalSeconds(tzOffsetMinutes * 60));
    }

    /** Converts a stored UTC LocalDateTime to the audit timestamp (UTC). */
    public static Instant utcToInstant(LocalDateTime utc) {
        return utc == null ? null : utc.toInstant(UTC);
    }

    public static LocalDate parseDate(String value) {
        return LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE);
    }

    public static LocalDate todayUtc() {
        return LocalDate.now(UTC);
    }
}
