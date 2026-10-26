package com.zz.babyfeeding.sync;

/** Per-item sync outcome (contract 4.10). */
public enum SyncItemStatus {
    APPLIED,
    DUPLICATE,
    CONFLICT_SERVER_WINS,
    REJECTED
}
