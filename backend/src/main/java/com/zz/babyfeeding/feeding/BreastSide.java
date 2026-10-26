package com.zz.babyfeeding.feeding;

import com.zz.babyfeeding.common.api.ValidationExceptions;

public enum BreastSide {
    LEFT("左侧"),
    RIGHT("右侧"),
    BOTH("双侧");

    private final String label;

    BreastSide(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** Exact upper-case enum code; null/blank means absent. */
    public static BreastSide parseNullable(String field, String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 LEFT/RIGHT/BOTH");
        }
    }
}
