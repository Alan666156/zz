package com.zz.babyfeeding.feeding;

import com.zz.babyfeeding.common.api.ValidationExceptions;

public enum AmountUnit {
    ML("毫升"),
    G("克");

    private final String label;

    AmountUnit(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** Exact upper-case enum code; null/blank means absent. */
    public static AmountUnit parseNullable(String field, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 ML/G");
        }
    }
}
