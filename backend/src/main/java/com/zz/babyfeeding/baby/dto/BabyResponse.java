package com.zz.babyfeeding.baby.dto;

import java.time.Instant;
import java.time.LocalDate;

public record BabyResponse(
        String id,
        String name,
        String gender,
        LocalDate birthDate,
        boolean isDefault,
        int revision,
        Instant createdAt,
        Instant updatedAt,
        Instant deletedAt
) {
}
