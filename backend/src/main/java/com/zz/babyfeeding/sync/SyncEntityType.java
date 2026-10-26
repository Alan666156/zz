package com.zz.babyfeeding.sync;

import com.zz.babyfeeding.common.api.ValidationExceptions;

/** Syncable entity kinds (contract 4.10). Codes are strict and case-sensitive. */
public enum SyncEntityType {
    BABY,
    FEEDING_RECORD,
    GROWTH_RECORD;

    public static SyncEntityType parse(String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field("entityType", "entityType 必填");
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw ValidationExceptions.field("entityType", "未知 entityType: " + raw);
        }
    }
}
