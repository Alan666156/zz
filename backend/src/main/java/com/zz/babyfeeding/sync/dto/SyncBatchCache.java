package com.zz.babyfeeding.sync.dto;

/**
 * Value stored under sync:{deviceHash}:{batchId} for 24 h. The canonical
 * request hash distinguishes a replay from a conflicting reuse of batchId.
 */
public record SyncBatchCache(String requestHash, SyncPushResponse response) {
}
