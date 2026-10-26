package com.zz.babyfeeding.growth.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;

/**
 * API shape. metrics use the contract scale: height/head 1 decimal, weight 2.
 */
public record GrowthRecordResponse(
        String id,
        String babyId,
        LocalDate measuredOn,
        BigDecimal heightCm,
        BigDecimal weightKg,
        BigDecimal headCircumferenceCm,
        String note,
        int revision,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {
}
