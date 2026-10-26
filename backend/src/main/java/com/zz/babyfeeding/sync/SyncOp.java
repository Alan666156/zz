package com.zz.babyfeeding.sync;

import com.zz.babyfeeding.common.api.ValidationExceptions;

/** Sync operation (contract 4.10). */
public enum SyncOp {
    UPSERT,
    DELETE;

    public static SyncOp parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field("op", "op 必填");
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw ValidationExceptions.field("op", "未知 op: " + raw);
        }
    }
}
