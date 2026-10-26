package com.zz.babyfeeding.sync.dto;

import com.fasterxml.jackson.databind.JsonNode;

/**
 * One queued client change. data stays a JsonNode so domain fields can be
 * validated per item (and numeric strings rejected) without failing the whole
 * batch at JSON-binding time.
 */
public record SyncChangeRequest(
        String entityType,
        String op,
        String id,
        Integer baseRevision,
        JsonNode data
) {
}
