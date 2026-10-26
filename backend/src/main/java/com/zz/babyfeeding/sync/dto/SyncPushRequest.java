package com.zz.babyfeeding.sync.dto;

import java.util.List;

/** POST /api/v1/sync/push body (contract 4.10). */
public record SyncPushRequest(
        String batchId,
        String clientTime,
        List<SyncChangeRequest> changes
) {
}
