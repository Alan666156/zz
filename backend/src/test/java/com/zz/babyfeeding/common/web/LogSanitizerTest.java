package com.zz.babyfeeding.common.web;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LogSanitizerTest {

    @Test
    void hidesTheSignedExportTokenButKeepsThePathShape() {
        assertThat(LogSanitizer.path(
                "/api/v1/exports/feeding-records/eyJ2IjoxfQ.c2lnbmF0dXJl.csv"))
                .isEqualTo("/api/v1/exports/feeding-records/***.csv");
        assertThat(LogSanitizer.path(
                "/api/v1/exports/feeding-records/abc.def.csv?download=1"))
                .isEqualTo("/api/v1/exports/feeding-records/***.csv?download=1");
    }

    @Test
    void leavesOtherPathsAndMalformedPathsUntouched() {
        assertThat(LogSanitizer.path("/api/v1/babies/00000000-0000-4000-8000-000000000000"))
                .isEqualTo("/api/v1/babies/00000000-0000-4000-8000-000000000000");
        assertThat(LogSanitizer.path("/api/v1/exports/feeding-records"))
                .isEqualTo("/api/v1/exports/feeding-records");
        assertThat(LogSanitizer.path("/api/v1/exports/feeding-records/not-csv"))
                .isEqualTo("/api/v1/exports/feeding-records/not-csv");
        assertThat(LogSanitizer.path(null)).isNull();
    }
}
