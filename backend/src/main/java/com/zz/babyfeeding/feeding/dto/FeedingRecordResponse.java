package com.zz.babyfeeding.feeding.dto;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Online feeding-record representation. start/end keep the record's original
 * offset (contract 3.4); audit timestamps are UTC instants.
 */
public record FeedingRecordResponse(
        String id,
        String babyId,
        String feedType,
        String breastSide,
        BigDecimal amountValue,
        String amountUnit,
        Integer durationSec,
        String startedAt,
        String endedAt,
        LocalDate recordDate,
        int tzOffsetMinutes,
        String note,
        List<String> tags,
        int revision,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {
}
