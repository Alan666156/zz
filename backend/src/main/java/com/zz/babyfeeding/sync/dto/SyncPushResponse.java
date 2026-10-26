package com.zz.babyfeeding.sync.dto;

import java.util.List;

/** Batch response (contract 4.10). */
public record SyncPushResponse(
        String batchId,
        boolean replayed,
        String processedAt,
        List<SyncItemResult> results,
        SyncSummary summary
) {

    /** Replayed responses come from the 24 h batch cache with the flag flipped. */
    public SyncPushResponse withReplayed(boolean value) {
        return new SyncPushResponse(batchId, value, processedAt, results, summary);
    }
}
