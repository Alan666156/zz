package com.zz.babyfeeding.baby.dto;

import java.time.Instant;

public record DeleteBabyResponse(
        String id,
        int revision,
        Instant deletedAt,
        int cascadedFeedingRecords,
        int cascadedGrowthRecords,
        boolean alreadyDeleted
) {
}
