package com.zz.babyfeeding.feeding.dto;

import java.time.Instant;

public record DeleteFeedingRecordResponse(
        String id,
        int revision,
        Instant deletedAt,
        boolean alreadyDeleted
) {
}
