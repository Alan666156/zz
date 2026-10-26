package com.zz.babyfeeding.sync;

import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.sync.dto.SyncChangeRequest;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Batch-level shape rules (contract 4.10): 1-50 changes, canonical UUIDs,
 * valid entity/operation codes, a non-negative baseRevision, data present for
 * UPSERT, and no repeated (entityType,id). Domain field validation happens per
 * item so one bad record never rejects the batch.
 */
public final class SyncValidator {

    public static final int MAX_CHANGES = 50;

    private SyncValidator() {
    }

    public static void validateBatch(SyncPushRequest request) {
        if (request == null) {
            throw ValidationExceptions.field("body", "请求体不能为空");
        }
        UuidUtils.requireUuidV4("batchId", request.batchId());

        List<SyncChangeRequest> changes = request.changes();
        if (changes == null || changes.isEmpty()) {
            throw ValidationExceptions.field("changes", "changes 不能为空");
        }
        if (changes.size() > MAX_CHANGES) {
            throw ValidationExceptions.field("changes", "changes 最多 50 条");
        }

        Set<String> seen = new HashSet<>();
        for (int index = 0; index < changes.size(); index++) {
            SyncChangeRequest change = changes.get(index);
            if (change == null) {
                throw ValidationExceptions.field("changes",
                        "changes[" + index + "] 不能为空");
            }
            SyncEntityType entityType = SyncEntityType.parse(change.entityType());
            SyncOp op = SyncOp.parse(change.op());
            UuidUtils.requireUuidV4("id", change.id());
            if (change.baseRevision() == null) {
                throw ValidationExceptions.field("baseRevision", "baseRevision 必填");
            }
            if (change.baseRevision() < 0) {
                throw ValidationExceptions.field("baseRevision",
                        "baseRevision 必须大于等于 0");
            }
            if (op == SyncOp.UPSERT
                    && (change.data() == null || !change.data().isObject())) {
                throw ValidationExceptions.field("data", "UPSERT 必须提供 data 对象");
            }
            String key = entityType.name() + ":" + change.id();
            if (!seen.add(key)) {
                throw ValidationExceptions.field("changes",
                        "同一批次不允许重复的 entityType/id: " + key);
            }
        }
    }
}
