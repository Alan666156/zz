package com.zz.babyfeeding.export.dto;

/** POST /api/v1/exports/feeding-records body (contract 4.9). */
public record CreateExportRequest(String babyId, String from, String to) {
}
