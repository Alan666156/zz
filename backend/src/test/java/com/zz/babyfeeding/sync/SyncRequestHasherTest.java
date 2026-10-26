package com.zz.babyfeeding.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zz.babyfeeding.sync.dto.SyncChangeRequest;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class SyncRequestHasherTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String BATCH_ID = UUID.randomUUID().toString();
    private static final String ID = UUID.randomUUID().toString();

    private static ObjectNode ordered(String firstName, Object firstValue,
                                      String secondName, Object secondValue) {
        ObjectNode node = MAPPER.createObjectNode();
        node.put(firstName, String.valueOf(firstValue));
        node.put(secondName, String.valueOf(secondValue));
        return node;
    }

    private static String hash(ObjectNode data, String clientTime) {
        return SyncRequestHasher.hash(MAPPER, new SyncPushRequest(
                BATCH_ID, clientTime,
                List.of(new SyncChangeRequest("FEEDING_RECORD", "UPSERT", ID, 0, data))));
    }

    @Test
    void hashIgnoresObjectKeyOrder() {
        String first = hash(ordered("a", "1", "b", "2"), null);
        String second = hash(ordered("b", "2", "a", "1"), null);
        assertThat(first).isEqualTo(second).hasSize(64);
    }

    @Test
    void hashChangesWithClientRelevantValues() {
        String base = hash(ordered("a", "1", "b", "2"), "2026-10-26T16:00:00+08:00");
        assertThat(hash(ordered("a", "1", "b", "3"), "2026-10-26T16:00:00+08:00"))
                .isNotEqualTo(base);
        assertThat(hash(ordered("a", "1", "b", "2"), "2026-10-26T17:00:00+08:00"))
                .isNotEqualTo(base);
    }

    @Test
    void hashPreservesArrayOrder() {
        ObjectNode first = MAPPER.createObjectNode();
        first.putArray("tags").add("A").add("B");
        ObjectNode second = MAPPER.createObjectNode();
        second.putArray("tags").add("B").add("A");
        assertThat(hash(first, null)).isNotEqualTo(hash(second, null));
    }
}
