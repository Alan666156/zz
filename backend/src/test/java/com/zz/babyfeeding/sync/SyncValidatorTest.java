package com.zz.babyfeeding.sync;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.sync.dto.SyncChangeRequest;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SyncValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String BATCH_ID = UUID.randomUUID().toString();

    private static ObjectNode data() {
        return MAPPER.createObjectNode().put("feedType", "FORMULA");
    }

    private static SyncChangeRequest change(String entityType, String op,
                                            String id, Integer baseRevision,
                                            ObjectNode data) {
        return new SyncChangeRequest(entityType, op, id, baseRevision, data);
    }

    private static SyncPushRequest batch(SyncChangeRequest... changes) {
        return new SyncPushRequest(BATCH_ID, "2026-10-26T16:00:00+08:00",
                List.of(changes));
    }

    private static void assertFieldError(Runnable action, String field) {
        assertThatThrownBy(action::run)
                .isInstanceOfSatisfying(BusinessException.class, ex -> {
                    assertThat(ex.getErrorCode()).isEqualTo(ErrorCode.VALIDATION_ERROR);
                    assertThat(ex.getData().toString()).contains(field);
                });
    }

    @Test
    void acceptsWellFormedBatch() {
        SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", UUID.randomUUID().toString(), 0, data()),
                change("FEEDING_RECORD", "DELETE", UUID.randomUUID().toString(), 3, null),
                change("GROWTH_RECORD", "UPSERT", UUID.randomUUID().toString(), 1, data())));
    }

    @Test
    void rejectsMissingOrInvalidBatchId() {
        assertFieldError(() -> SyncValidator.validateBatch(
                new SyncPushRequest(null, null, List.of(change("BABY", "UPSERT",
                        UUID.randomUUID().toString(), 0, data())))), "batchId");
        assertFieldError(() -> SyncValidator.validateBatch(
                new SyncPushRequest("not-uuid", null, List.of(change("BABY", "UPSERT",
                        UUID.randomUUID().toString(), 0, data())))), "batchId");
    }

    @Test
    void rejectsEmptyAndOversizedBatches() {
        assertFieldError(() -> SyncValidator.validateBatch(
                new SyncPushRequest(BATCH_ID, null, List.of())), "changes");
        assertFieldError(() -> SyncValidator.validateBatch(
                new SyncPushRequest(BATCH_ID, null, null)), "changes");

        List<SyncChangeRequest> fiftyOne = new ArrayList<>();
        for (int index = 0; index <= SyncValidator.MAX_CHANGES; index++) {
            fiftyOne.add(change("FEEDING_RECORD", "UPSERT",
                    UUID.randomUUID().toString(), 0, data()));
        }
        assertFieldError(() -> SyncValidator.validateBatch(
                new SyncPushRequest(BATCH_ID, null, fiftyOne)), "changes");
    }

    @Test
    void acceptsFiftyChanges() {
        List<SyncChangeRequest> fifty = new ArrayList<>();
        for (int index = 0; index < SyncValidator.MAX_CHANGES; index++) {
            fifty.add(change("FEEDING_RECORD", "UPSERT",
                    UUID.randomUUID().toString(), 0, data()));
        }
        SyncValidator.validateBatch(new SyncPushRequest(BATCH_ID, null, fifty));
    }

    @Test
    void rejectsUnknownEntityTypeAndOperation() {
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("UNKNOWN", "UPSERT", UUID.randomUUID().toString(), 0, data()))),
                "entityType");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("baby", "UPSERT", UUID.randomUUID().toString(), 0, data()))),
                "entityType");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "MERGE", UUID.randomUUID().toString(), 0, data()))),
                "op");
    }

    @Test
    void rejectsInvalidIdAndBaseRevision() {
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", "not-a-uuid", 0, data()))), "id");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", UUID.randomUUID().toString().toUpperCase(), 0,
                        data()))), "id");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", UUID.randomUUID().toString(), null, data()))),
                "baseRevision");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", UUID.randomUUID().toString(), -1, data()))),
                "baseRevision");
    }

    @Test
    void upsertRequiresObjectDataAndDeleteDoesNot() {
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("BABY", "UPSERT", UUID.randomUUID().toString(), 0, null))),
                "data");
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                new SyncChangeRequest("BABY", "UPSERT", UUID.randomUUID().toString(), 0,
                        MAPPER.getNodeFactory().textNode("x")))), "data");

        SyncValidator.validateBatch(batch(
                change("BABY", "DELETE", UUID.randomUUID().toString(), 1, null)));
    }

    @Test
    void rejectsDuplicateEntityTypeAndIdPair() {
        String id = UUID.randomUUID().toString();
        assertFieldError(() -> SyncValidator.validateBatch(batch(
                change("FEEDING_RECORD", "UPSERT", id, 0, data()),
                change("FEEDING_RECORD", "DELETE", id, 1, null))), "changes");
    }
}
