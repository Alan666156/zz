package com.zz.babyfeeding.export.dto;

/**
 * Signed download ticket. expiresAt is a preformatted UTC timestamp with
 * millisecond precision (the signed token itself carries Unix seconds).
 */
public record ExportTicketResponse(String downloadUrl, String expiresAt, int rowCount) {
}
