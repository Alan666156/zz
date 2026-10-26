package com.zz.babyfeeding.sync;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Iterator;
import java.util.List;

/**
 * Canonical SHA-256 of the batch request. Object keys are sorted so an
 * equivalent replay with a different key order still matches its batchId.
 */
public final class SyncRequestHasher {

    private SyncRequestHasher() {
    }

    public static String hash(ObjectMapper objectMapper, SyncPushRequest request) {
        StringBuilder canonical = new StringBuilder();
        append(canonical, objectMapper.valueToTree(request));
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(
                    digest.digest(canonical.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available", ex);
        }
    }

    private static void append(StringBuilder target, JsonNode node) {
        if (node == null || node.isNull()) {
            target.append("null");
            return;
        }
        if (node.isObject()) {
            List<String> names = new ArrayList<>();
            for (Iterator<String> iterator = node.fieldNames(); iterator.hasNext(); ) {
                names.add(iterator.next());
            }
            names.sort(String::compareTo);
            target.append('{');
            for (int index = 0; index < names.size(); index++) {
                if (index > 0) {
                    target.append(',');
                }
                target.append(JsonNodeFactoryHolder.text(names.get(index))).append(':');
                append(target, node.get(names.get(index)));
            }
            target.append('}');
            return;
        }
        if (node.isArray()) {
            target.append('[');
            for (int index = 0; index < node.size(); index++) {
                if (index > 0) {
                    target.append(',');
                }
                append(target, node.get(index));
            }
            target.append(']');
            return;
        }
        target.append(node.toString());
    }

    private static final class JsonNodeFactoryHolder {
        private static String text(String value) {
            try {
                return com.fasterxml.jackson.databind.node.JsonNodeFactory.instance
                        .textNode(value).toString();
            } catch (RuntimeException ex) {
                throw new IllegalStateException("failed to canonicalize field name", ex);
            }
        }
    }
}
