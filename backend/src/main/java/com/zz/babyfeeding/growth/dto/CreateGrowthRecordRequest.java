package com.zz.babyfeeding.growth.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * POST body. Metrics are JsonNodes so numeric strings are rejected (Q-02);
 * measuredOn stays a string so bad dates become VALIDATION_ERROR.
 */
public record CreateGrowthRecordRequest(
        String id,
        String babyId,
        String measuredOn,
        JsonNode heightCm,
        JsonNode weightKg,
        JsonNode headCircumferenceCm,
        String note
) {
}
