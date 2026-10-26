package com.zz.babyfeeding.baby.dto;

import java.time.LocalDate;

public record PatchBabyRequest(
        Integer baseRevision,
        String name,
        String gender,
        LocalDate birthDate,
        Boolean isDefault
) {
}
