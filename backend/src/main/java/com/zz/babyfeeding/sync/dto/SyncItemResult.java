package com.zz.babyfeeding.sync.dto;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.Map;

/**
 * One result, in request order. record is the current server representation;
 * it is the only place a tombstone may be returned (Q-07).
 */
public record SyncItemResult(
        String entityType,
        String id,
        String status,
        Integer revision,
        JsonNode record,
        Map<String, Object> error
) {
}
