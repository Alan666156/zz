package com.zz.babyfeeding.growth.dto;

import java.time.Instant;

public record DeleteGrowthRecordResponse(
        String id,
        int revision,
        Instant deletedAt,
        boolean alreadyDeleted
) {
}
