package com.zz.babyfeeding.feeding.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

/**
 * POST body. Enums and timestamps stay as strings so invalid values surface as
 * VALIDATION_ERROR instead of a generic JSON parse failure. amountValue is a
 * JsonNode so numeric strings can be rejected (FEED-23).
 */
public record CreateFeedingRecordRequest(
        String id,
        String babyId,
        String feedType,
        String breastSide,
        JsonNode amountValue,
        String amountUnit,
        Integer durationSec,
        String startedAt,
        String endedAt,
        String note,
        List<String> tags
) {
}
