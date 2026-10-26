package com.zz.babyfeeding.baby.dto;

import java.time.LocalDate;

public record CreateBabyRequest(
        String id,
        String name,
        String gender,
        LocalDate birthDate,
        Boolean isDefault
) {
}
