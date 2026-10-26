package com.zz.babyfeeding.growth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GrowthValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final LocalDate BIRTH_DATE = LocalDate.parse("2026-03-01");
    private static final LocalDate TODAY = LocalDate.parse("2026-10-26");

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    @Test
    void requiresAtLeastOneMetric() {
        assertFieldError(() -> GrowthValidator.validateMetrics(null, null, null), "metrics");
        GrowthValidator.validateMetrics(new BigDecimal("68.5"), null, null);
        GrowthValidator.validateMetrics(null, new BigDecimal("8.12"), null);
        GrowthValidator.validateMetrics(null, null, new BigDecimal("43.0"));
    }

    @Test
    void acceptsRangeBoundaries() {
        GrowthValidator.validateMetrics(new BigDecimal("20.0"), null, null);
        GrowthValidator.validateMetrics(new BigDecimal("150.0"), null, null);
        GrowthValidator.validateMetrics(null, new BigDecimal("0.5"), null);
        GrowthValidator.validateMetrics(null, new BigDecimal("50"), null);
        GrowthValidator.validateMetrics(null, null, new BigDecimal("20.0"));
        GrowthValidator.validateMetrics(null, null, new BigDecimal("70.0"));
    }

    @Test
    void rejectsOutOfRangeMetrics() {
        assertFieldError(() -> GrowthValidator.validateMetrics(
                new BigDecimal("19.9"), null, null), "heightCm");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                new BigDecimal("150.1"), null, null), "heightCm");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, new BigDecimal("0.49"), null), "weightKg");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, new BigDecimal("50.01"), null), "weightKg");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, null, new BigDecimal("19.9")), "headCircumferenceCm");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, null, new BigDecimal("70.1")), "headCircumferenceCm");
    }

    @Test
    void enforcesPerMetricPrecision() {
        GrowthValidator.validateMetrics(new BigDecimal("68.5"),
                new BigDecimal("8.12"), new BigDecimal("43.0"));
        // Trailing zeroes are not extra precision.
        GrowthValidator.validateMetrics(new BigDecimal("68.50"),
                new BigDecimal("8.120"), new BigDecimal("43.00"));

        assertFieldError(() -> GrowthValidator.validateMetrics(
                new BigDecimal("68.55"), null, null), "heightCm");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, new BigDecimal("8.123"), null), "weightKg");
        assertFieldError(() -> GrowthValidator.validateMetrics(
                null, null, new BigDecimal("43.55")), "headCircumferenceCm");
    }

    @Test
    void parsesOnlyJsonNumbers() throws Exception {
        assertThat(GrowthValidator.parseMetric("weightKg", json("8.12")))
                .isEqualByComparingTo("8.12");
        assertThat(GrowthValidator.parseMetric("weightKg", json("null"))).isNull();
        assertThat(GrowthValidator.parseMetric("weightKg", null)).isNull();

        JsonNode stringValue = json("\"8.12\"");
        JsonNode booleanValue = json("true");
        assertFieldError(() -> GrowthValidator.parseMetric("weightKg", stringValue),
                "weightKg");
        assertFieldError(() -> GrowthValidator.parseMetric("weightKg", booleanValue),
                "weightKg");
    }

    @Test
    void validatesMeasuredOnWindow() {
        GrowthValidator.validateMeasuredOn(BIRTH_DATE, BIRTH_DATE, TODAY);
        GrowthValidator.validateMeasuredOn(TODAY, BIRTH_DATE, TODAY);
        GrowthValidator.validateMeasuredOn(TODAY.plusDays(1), BIRTH_DATE, TODAY);

        assertFieldError(() -> GrowthValidator.validateMeasuredOn(
                TODAY.plusDays(2), BIRTH_DATE, TODAY), "measuredOn");
        assertFieldError(() -> GrowthValidator.validateMeasuredOn(
                BIRTH_DATE.minusDays(1), BIRTH_DATE, TODAY), "measuredOn");
        assertFieldError(() -> GrowthValidator.parseMeasuredOn(null), "measuredOn");
        assertFieldError(() -> GrowthValidator.parseMeasuredOn("  "), "measuredOn");
        assertFieldError(() -> GrowthValidator.parseMeasuredOn("2026/10/20"), "measuredOn");
    }

    @Test
    void validatesListRangeAndQueryFields() {
        assertFieldError(() -> GrowthValidator.validateRange("from",
                LocalDate.parse("2025-10-19"), LocalDate.parse("2026-10-20")), "from");
        GrowthValidator.validateRange("from",
                LocalDate.parse("2025-10-20"), LocalDate.parse("2026-10-20"));
        assertFieldError(() -> GrowthValidator.validateRange("from",
                LocalDate.parse("2026-10-21"), LocalDate.parse("2026-10-20")), "from");

        assertFieldError(() -> GrowthValidator.parseQueryDate("to", "bad"), "to");
    }

    @Test
    void scalesResponseValues() {
        assertThat(GrowthValidator.heightScale(new BigDecimal("68")))
                .isEqualTo(new BigDecimal("68.0"));
        assertThat(GrowthValidator.heightScale(new BigDecimal("68.50")))
                .isEqualTo(new BigDecimal("68.5"));
        assertThat(GrowthValidator.weightScale(new BigDecimal("8.5")))
                .isEqualTo(new BigDecimal("8.50"));
        assertThat(GrowthValidator.weightScale(new BigDecimal("8.12")))
                .isEqualTo(new BigDecimal("8.12"));
        assertThat(GrowthValidator.heightScale(null)).isNull();
        assertThat(GrowthValidator.weightScale(null)).isNull();
    }

    @Test
    void countsNoteCodePoints() {
        assertThat(GrowthValidator.parseNote("测".repeat(200))).hasSize(200);
        assertFieldError(() -> GrowthValidator.parseNote("测".repeat(201)), "note");
    }

    private static JsonNode json(String literal) throws Exception {
        return MAPPER.readTree(literal);
    }
}
