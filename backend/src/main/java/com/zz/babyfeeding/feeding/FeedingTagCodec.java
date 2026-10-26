package com.zz.babyfeeding.feeding;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Converts between the stored JSON tag array and API values. Stored codes are
 * always written deduplicated and in enum declaration order (Q-03).
 */
@Component
public class FeedingTagCodec {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final ObjectMapper objectMapper;

    public FeedingTagCodec(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public String toJson(List<FeedingTag> tags) {
        if (tags == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(tags.stream().map(Enum::name).toList());
        } catch (Exception ex) {
            throw new IllegalStateException("failed to encode feeding tags", ex);
        }
    }

    /** Returns null for a null/blank column, otherwise the stored order. */
    public List<String> fromJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ex) {
            throw new IllegalStateException("failed to decode feeding tags", ex);
        }
    }

    /** Re-validates and reorders stored tags, tolerating historical values. */
    public List<FeedingTag> toTags(List<String> storedCodes) {
        if (storedCodes == null) {
            return null;
        }
        return FeedingValidator.parseTags(storedCodes);
    }
}
