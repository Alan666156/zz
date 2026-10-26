package com.zz.babyfeeding.feeding;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FeedingValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final LocalDate BIRTH_DATE = LocalDate.parse("2026-03-01");
    private static final Instant NOW = Instant.parse("2026-10-26T00:00:00Z");
    private static final OffsetDateTime START =
            OffsetDateTime.parse("2026-10-20T08:00:00+08:00");

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    private static JsonNode json(String literal) throws Exception {
        return MAPPER.readTree(literal);
    }

    // ------------------------------------------------------------ type matrix

    @Test
    void acceptsValidRowsForAllFourTypes() {
        FeedingValidator.validateMatrix(FeedingType.BREAST, BreastSide.LEFT,
                null, null, 900);

        FeedingValidator.validateMatrix(FeedingType.FORMULA, null,
                new BigDecimal("500"), AmountUnit.ML, 0);
        FeedingValidator.validateMatrix(FeedingType.FORMULA, null,
                new BigDecimal("120.5"), AmountUnit.ML, 21_600);

        FeedingValidator.validateMatrix(FeedingType.MIXED, BreastSide.BOTH,
                new BigDecimal("90"), AmountUnit.ML, 480);

        FeedingValidator.validateMatrix(FeedingType.SOLID, null,
                null, null, null);
        FeedingValidator.validateMatrix(FeedingType.SOLID, null,
                new BigDecimal("2000"), AmountUnit.G, 0);
    }

    @Test
    void rejectsBreastRowsWithSideAmountUnitOrDurationProblems() {
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                null, null, null, 900), "breastSide");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                BreastSide.LEFT, new BigDecimal("10"), null, 900), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                BreastSide.LEFT, null, AmountUnit.ML, 900), "amountUnit");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                BreastSide.LEFT, null, null, null), "durationSec");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                BreastSide.LEFT, null, null, 0), "durationSec");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.BREAST,
                BreastSide.LEFT, null, null, 21_601), "durationSec");
    }

    @Test
    void rejectsFormulaBoundaries() {
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, null, AmountUnit.ML, 10), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, BigDecimal.ZERO, AmountUnit.ML, null), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, new BigDecimal("500.01"), AmountUnit.ML, null), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, new BigDecimal("120"), AmountUnit.G, null), "amountUnit");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                BreastSide.LEFT, new BigDecimal("120"), AmountUnit.ML, null), "breastSide");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, new BigDecimal("120"), AmountUnit.ML, 21_601), "durationSec");
    }

    @Test
    void rejectsMixedAndSolidProblems() {
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.MIXED,
                BreastSide.BOTH, null, AmountUnit.ML, 480), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.MIXED,
                BreastSide.BOTH, new BigDecimal("90"), AmountUnit.ML, 0), "durationSec");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.MIXED,
                BreastSide.BOTH, new BigDecimal("90"), AmountUnit.G, 480), "amountUnit");

        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.SOLID,
                null, BigDecimal.ZERO, AmountUnit.G, null), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.SOLID,
                null, new BigDecimal("2000.01"), AmountUnit.G, null), "amountValue");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.SOLID,
                null, new BigDecimal("30"), AmountUnit.ML, null), "amountUnit");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.SOLID,
                BreastSide.LEFT, new BigDecimal("30"), AmountUnit.G, null), "breastSide");
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.SOLID,
                null, null, AmountUnit.G, null), "amountUnit");
    }

    @Test
    void rejectsMoreThanOneDecimalPlace() {
        assertFieldError(() -> FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, new BigDecimal("120.55"), AmountUnit.ML, null), "amountValue");
        // Trailing zeroes do not count as precision.
        FeedingValidator.validateMatrix(FeedingType.FORMULA,
                null, new BigDecimal("120.50"), AmountUnit.ML, null);
    }

    // ---------------------------------------------------------------- amount

    @Test
    void parsesOnlyJsonNumbers() throws Exception {
        assertThat(FeedingValidator.parseAmount(json("120.5")))
                .isEqualByComparingTo("120.5");
        assertThat(FeedingValidator.parseAmount(json("null"))).isNull();
        assertThat(FeedingValidator.parseAmount(null)).isNull();

        JsonNode stringAmount = json("\"120\"");
        JsonNode booleanAmount = json("true");
        assertFieldError(() -> FeedingValidator.parseAmount(stringAmount), "amountValue");
        assertFieldError(() -> FeedingValidator.parseAmount(booleanAmount), "amountValue");
    }

    @Test
    void normalisesResponseScale() {
        assertThat(FeedingValidator.normalizeAmount(new BigDecimal("120.00")))
                .isEqualTo(new BigDecimal("120"));
        assertThat(FeedingValidator.normalizeAmount(new BigDecimal("120.50")))
                .isEqualTo(new BigDecimal("120.5"));
        assertThat(FeedingValidator.normalizeAmount(null)).isNull();
    }

    // ---------------------------------------------------------------- enums

    @Test
    void enumParsingIsStrictAndCaseSensitive() {
        assertThat(FeedingType.parse("feedType", "BREAST")).isEqualTo(FeedingType.BREAST);
        assertFieldError(() -> FeedingType.parse("feedType", "breast"), "feedType");
        assertFieldError(() -> FeedingType.parse("feedType", "WATER"), "feedType");
        assertFieldError(() -> FeedingType.parse("feedType", null), "feedType");

        assertThat(BreastSide.parseNullable("breastSide", null)).isNull();
        assertFieldError(() -> BreastSide.parseNullable("breastSide", "left"), "breastSide");
        assertFieldError(() -> AmountUnit.parseNullable("amountUnit", "ml"), "amountUnit");
    }

    // ---------------------------------------------------------------- tags

    @Test
    void dedupesAndSortsTagsInEnumOrder() {
        assertThat(FeedingValidator.parseTags(
                List.of("SLEEPY", "SPIT_UP", "SLEEPY")))
                .containsExactly(FeedingTag.SPIT_UP, FeedingTag.SLEEPY);
        assertThat(FeedingValidator.parseTags(List.of())).isEmpty();
        assertThat(FeedingValidator.parseTags(null)).isNull();
        assertThat(FeedingValidator.parseTags(
                List.of("SPIT_UP", "REFUSED", "SLEEPY", "HICCUP", "OTHER")))
                .hasSize(5);
    }

    @Test
    void rejectsUnknownAndNullTags() {
        assertFieldError(() -> FeedingValidator.parseTags(List.of("UNKNOWN")), "tags");
        assertFieldError(() -> FeedingValidator.parseTags(List.of("spit_up")), "tags");
        assertFieldError(() -> FeedingValidator.parseTags(
                java.util.Arrays.asList("SPIT_UP", null)), "tags");
    }

    // ---------------------------------------------------------------- notes

    @Test
    void countsNoteInUnicodeCodePoints() {
        assertThat(FeedingValidator.parseNote("备".repeat(200))).hasSize(200);
        assertFieldError(() -> FeedingValidator.parseNote("备".repeat(201)), "note");
        assertThat(FeedingValidator.parseNote(null)).isNull();
    }

    // ---------------------------------------------------------------- times

    @Test
    void validatesStartedAtAgainstBirthDateAndNow() {
        FeedingValidator.validateTimes(START, null, BIRTH_DATE, NOW);

        OffsetDateTime tooEarly =
                OffsetDateTime.parse("2026-02-28T23:30:00+08:00");
        assertFieldError(() -> FeedingValidator.validateTimes(
                tooEarly, null, BIRTH_DATE, NOW), "startedAt");

        Instant now = Instant.parse("2026-10-20T00:00:00Z");
        assertFieldError(() -> FeedingValidator.validateTimes(
                START, null, BIRTH_DATE, now.minusSeconds(301)), "startedAt");
        // Exactly five minutes ahead is still accepted.
        FeedingValidator.validateTimes(START, null, BIRTH_DATE, now.minusSeconds(300));
    }

    @Test
    void validatesEndedAtOrderingAndSixHourLimit() {
        assertFieldError(() -> FeedingValidator.validateTimes(START,
                START.minusSeconds(1), BIRTH_DATE, NOW), "endedAt");
        assertFieldError(() -> FeedingValidator.validateTimes(START,
                START.plusHours(6).plusSeconds(1), BIRTH_DATE, NOW), "endedAt");
        FeedingValidator.validateTimes(START, START.plusHours(6), BIRTH_DATE, NOW);
        FeedingValidator.validateTimes(START, START.plusMinutes(15), BIRTH_DATE, NOW);
    }

    @Test
    void rejectsMalformedOrOffsetlessTimestamps() {
        assertFieldError(() -> FeedingValidator.parseStartedAt("2026-10-20T08:00:00"),
                "startedAt");
        assertFieldError(() -> FeedingValidator.parseStartedAt(null), "startedAt");
        assertThat(FeedingValidator.parseEndedAtNullable(null)).isNull();
        assertThat(FeedingValidator.parseStartedAt("2026-10-20T00:00:00Z"))
                .isEqualTo(OffsetDateTime.parse("2026-10-20T00:00:00Z"));
    }
}
