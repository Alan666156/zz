package com.zz.babyfeeding.feeding;

import com.zz.babyfeeding.common.api.ValidationExceptions;

public enum FeedingType {
    BREAST("母乳"),
    FORMULA("配方奶"),
    MIXED("混合"),
    SOLID("辅食");

    private final String label;

    FeedingType(String label) {
        this.label = label;
    }

    public String label() {
        return label;
    }

    /** Enum codes are exact upper-case tokens; no trimming or case folding. */
    public static FeedingType parse(String field, String raw) {
        if (raw == null || raw.isBlank()) {
            throw ValidationExceptions.field(field, field + " 必填");
        }
        try {
            return valueOf(raw);
        } catch (IllegalArgumentException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 BREAST/FORMULA/MIXED/SOLID");
        }
    }

    public boolean requiresBreastSide() {
        return this == BREAST || this == MIXED;
    }

    public boolean isMilk() {
        return this == FORMULA || this == MIXED;
    }
}
