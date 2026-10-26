package com.zz.babyfeeding.sync;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.baby.BabyCacheService;
import com.zz.babyfeeding.baby.BabyEntity;
import com.zz.babyfeeding.baby.BabyMapper;
import com.zz.babyfeeding.baby.BabyService;
import com.zz.babyfeeding.baby.BabyValidator;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.device.DeviceMapper;
import com.zz.babyfeeding.feeding.AmountUnit;
import com.zz.babyfeeding.feeding.BreastSide;
import com.zz.babyfeeding.feeding.FeedingRecordEntity;
import com.zz.babyfeeding.feeding.FeedingRecordMapper;
import com.zz.babyfeeding.feeding.FeedingService;
import com.zz.babyfeeding.feeding.FeedingTag;
import com.zz.babyfeeding.feeding.FeedingTagCodec;
import com.zz.babyfeeding.feeding.FeedingType;
import com.zz.babyfeeding.feeding.FeedingValidator;
import com.zz.babyfeeding.growth.GrowthRecordEntity;
import com.zz.babyfeeding.growth.GrowthRecordMapper;
import com.zz.babyfeeding.growth.GrowthService;
import com.zz.babyfeeding.growth.GrowthValidator;
import com.zz.babyfeeding.sync.dto.SyncBatchCache;
import com.zz.babyfeeding.sync.dto.SyncChangeRequest;
import com.zz.babyfeeding.sync.dto.SyncItemResult;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;
import com.zz.babyfeeding.sync.dto.SyncPushResponse;
import com.zz.babyfeeding.sync.dto.SyncSummary;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Offline batch sync (contract 4.10, addendum Q-07/Q-08/Q-17).
 *
 * <p>Batch flow: validate shape (400 on structural errors), acquire the 15 s
 * device lock, replay the 24 h batch cache by canonical request hash, then
 * process every change in request order in its own REQUIRES_NEW transaction.
 * Per-item revision checks decide APPLIED/DUPLICATE/CONFLICT_SERVER_WINS;
 * domain failures become a single REJECTED result without rolling back the
 * other items. Redis is fail-open: without Redis the lock/cache are skipped and
 * the per-item revision rules still make retries safe.</p>
 */
@Service
public class SyncService {

    private static final Duration BATCH_CACHE_TTL = Duration.ofHours(24);
    private static final Duration STATS_VERSION_TTL = Duration.ofDays(7);

    private final BabyMapper babyMapper;
    private final FeedingRecordMapper feedingMapper;
    private final GrowthRecordMapper growthMapper;
    private final DeviceMapper deviceMapper;
    private final BabyCacheService babyCache;
    private final RedisCacheService redisCache;
    private final RedisKeys redisKeys;
    private final FeedingTagCodec tagCodec;
    private final ObjectMapper objectMapper;
    private final SyncLockService syncLockService;
    private final FeedingService feedingService;
    private final GrowthService growthService;
    private final TransactionTemplate transactionTemplate;

    public SyncService(BabyMapper babyMapper,
                       FeedingRecordMapper feedingMapper,
                       GrowthRecordMapper growthMapper,
                       DeviceMapper deviceMapper,
                       BabyCacheService babyCache,
                       RedisCacheService redisCache,
                       RedisKeys redisKeys,
                       FeedingTagCodec tagCodec,
                       ObjectMapper objectMapper,
                       SyncLockService syncLockService,
                       FeedingService feedingService,
                       GrowthService growthService,
                       PlatformTransactionManager transactionManager) {
        this.babyMapper = babyMapper;
        this.feedingMapper = feedingMapper;
        this.growthMapper = growthMapper;
        this.deviceMapper = deviceMapper;
        this.babyCache = babyCache;
        this.redisCache = redisCache;
        this.redisKeys = redisKeys;
        this.tagCodec = tagCodec;
        this.objectMapper = objectMapper;
        this.syncLockService = syncLockService;
        this.feedingService = feedingService;
        this.growthService = growthService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
        this.transactionTemplate.setPropagationBehavior(
                TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public SyncPushResponse push(DeviceContext.Identity device, SyncPushRequest request) {
        SyncValidator.validateBatch(request);

        SyncLockService.Attempt lock = syncLockService.acquire(device.hashHex());
        if (lock.blocked()) {
            throw new BusinessException(ErrorCode.SYNC_IN_PROGRESS).withRetryAfterSeconds(1);
        }

        try {
            String requestHash = SyncRequestHasher.hash(objectMapper, request);
            String cacheKey = redisKeys.syncBatch(device.hashHex(), request.batchId());
            Optional<SyncBatchCache> cached = redisCache.get(cacheKey, SyncBatchCache.class);
            if (cached.isPresent()) {
                SyncBatchCache entry = cached.get();
                if (!requestHash.equals(entry.requestHash())) {
                    throw new BusinessException(ErrorCode.CONFLICT,
                            "相同 batchId 的请求体不一致");
                }
                return entry.response().withReplayed(true);
            }

            List<SyncItemResult> results = new ArrayList<>();
            for (SyncChangeRequest change : request.changes()) {
                SyncItemResult result;
                try {
                    result = transactionTemplate.execute(status -> processItem(device, change));
                } catch (BusinessException ex) {
                    result = rejected(change, ex);
                }
                results.add(result);
            }

            SyncPushResponse response = new SyncPushResponse(
                    request.batchId(),
                    false,
                    TimeUtils.formatInstant(TimeUtils.now()),
                    results,
                    summarize(results));
            redisCache.put(cacheKey, new SyncBatchCache(requestHash, response),
                    BATCH_CACHE_TTL);
            return response;
        } finally {
            syncLockService.release(device.hashHex(), lock);
        }
    }

    // --------------------------------------------------------------- dispatch

    private SyncItemResult processItem(DeviceContext.Identity device, SyncChangeRequest change) {
        SyncEntityType entityType = SyncEntityType.parse(change.entityType());
        SyncOp op = SyncOp.parse(change.op());
        return switch (entityType) {
            case BABY -> op == SyncOp.UPSERT
                    ? upsertBaby(device, change)
                    : deleteBaby(device, change);
            case FEEDING_RECORD -> op == SyncOp.UPSERT
                    ? upsertFeeding(device, change)
                    : deleteFeeding(device, change);
            case GROWTH_RECORD -> op == SyncOp.UPSERT
                    ? upsertGrowth(device, change)
                    : deleteGrowth(device, change);
        };
    }

    // ------------------------------------------------------------------- baby

    private SyncItemResult upsertBaby(DeviceContext.Identity device,
                                      SyncChangeRequest change) {
        deviceMapper.lockById(device.deviceRowId());
        BabyEntity existing = babyMapper.selectAnyById(change.id());
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), BabyService.toResponse(existing));
            }
            int baseRevision = change.baseRevision();
            if (baseRevision == 0) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), BabyService.toResponse(existing));
            }
            if (baseRevision != existing.getRevision()) {
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        existing.getRevision(), BabyService.toResponse(existing));
            }

            BabyInput input = parseBabyData(change.data(), existing);
            boolean currentlyDefault = Boolean.TRUE.equals(existing.getIsDefault());
            if (currentlyDefault && !input.isDefault()) {
                throw new BusinessException(ErrorCode.DEFAULT_BABY_REQUIRED);
            }

            LocalDateTime now = TimeUtils.nowUtcLocal();
            if (input.isDefault() && !currentlyDefault) {
                babyMapper.clearDefaultForDevice(device.deviceRowId(), change.id(), now);
            }
            LambdaUpdateWrapper<BabyEntity> update = Wrappers.lambdaUpdate();
            update.eq(BabyEntity::getId, change.id())
                    .eq(BabyEntity::getDeviceId, device.deviceRowId())
                    .isNull(BabyEntity::getDeletedAt)
                    .eq(BabyEntity::getRevision, baseRevision)
                    .set(BabyEntity::getName, input.name())
                    .set(BabyEntity::getGender, input.gender())
                    .set(BabyEntity::getBirthDate, input.birthDate())
                    .set(BabyEntity::getIsDefault, input.isDefault())
                    .set(BabyEntity::getRevision, baseRevision + 1)
                    .set(BabyEntity::getUpdatedAt, now);
            if (babyMapper.update(null, update) == 0) {
                BabyEntity latest = babyMapper.selectAnyById(change.id());
                if (latest == null) {
                    throw notFound();
                }
                ensureOwned(device, latest);
                if (latest.getDeletedAt() != null) {
                    return result(change, SyncItemStatus.DUPLICATE,
                            latest.getRevision(), BabyService.toResponse(latest));
                }
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        latest.getRevision(), BabyService.toResponse(latest));
            }

            BabyEntity updated = babyMapper.selectAnyById(change.id());
            babyCache.evict(device.hashHex(), change.id());
            return result(change, SyncItemStatus.APPLIED,
                    updated.getRevision(), BabyService.toResponse(updated));
        }

        if (change.baseRevision() != 0) {
            // The server has no row for a positive baseRevision; nothing to
            // insert and no current record to return.
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS, null, null);
        }

        BabyInput input = parseBabyData(change.data(), null);
        int activeCount = babyMapper.countActiveByDevice(device.deviceRowId());
        if (activeCount >= BabyService.MAX_BABIES) {
            throw new BusinessException(ErrorCode.BABY_LIMIT_EXCEEDED);
        }
        LocalDateTime now = TimeUtils.nowUtcLocal();
        boolean isDefault = input.isDefault() || activeCount == 0;
        if (isDefault && activeCount > 0) {
            babyMapper.clearDefaultForDevice(device.deviceRowId(), change.id(), now);
        }

        BabyEntity entity = new BabyEntity();
        entity.setId(change.id());
        entity.setDeviceId(device.deviceRowId());
        entity.setName(input.name());
        entity.setGender(input.gender());
        entity.setBirthDate(input.birthDate());
        entity.setIsDefault(isDefault);
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        try {
            babyMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            BabyEntity raced = babyMapper.selectAnyById(change.id());
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            return result(change, SyncItemStatus.DUPLICATE,
                    raced.getRevision(), BabyService.toResponse(raced));
        }
        babyCache.put(device.hashHex(), entity);
        return result(change, SyncItemStatus.APPLIED, 1, BabyService.toResponse(entity));
    }

    private SyncItemResult deleteBaby(DeviceContext.Identity device,
                                      SyncChangeRequest change) {
        deviceMapper.lockById(device.deviceRowId());
        BabyEntity any = babyMapper.selectAnyById(change.id());
        if (any == null) {
            return result(change, SyncItemStatus.DUPLICATE, null, null);
        }
        ensureOwned(device, any);
        if (any.getDeletedAt() != null) {
            return result(change, SyncItemStatus.DUPLICATE,
                    any.getRevision(), BabyService.toResponse(any));
        }
        int baseRevision = change.baseRevision();
        if (baseRevision != any.getRevision()) {
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    any.getRevision(), BabyService.toResponse(any));
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<BabyEntity> update = Wrappers.lambdaUpdate();
        update.eq(BabyEntity::getId, change.id())
                .eq(BabyEntity::getDeviceId, device.deviceRowId())
                .isNull(BabyEntity::getDeletedAt)
                .eq(BabyEntity::getRevision, baseRevision)
                .set(BabyEntity::getDeletedAt, now)
                .set(BabyEntity::getRevision, baseRevision + 1)
                .set(BabyEntity::getUpdatedAt, now);
        if (babyMapper.update(null, update) == 0) {
            BabyEntity latest = babyMapper.selectAnyById(change.id());
            if (latest == null) {
                throw notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        latest.getRevision(), BabyService.toResponse(latest));
            }
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    latest.getRevision(), BabyService.toResponse(latest));
        }

        babyMapper.softDeleteFeedingRecords(change.id(), device.deviceRowId(), now);
        babyMapper.softDeleteGrowthRecords(change.id(), device.deviceRowId(), now);

        if (Boolean.TRUE.equals(any.getIsDefault())) {
            BabyEntity next = babyMapper.selectEarliestActiveExcluding(
                    device.deviceRowId(), change.id());
            if (next != null) {
                babyMapper.markDefault(next.getId(), device.deviceRowId(), now);
                babyCache.evict(device.hashHex(), next.getId());
            }
        }
        babyCache.evict(device.hashHex(), change.id());
        bumpStatsVersion(device, change.id());

        BabyEntity deleted = babyMapper.selectAnyById(change.id());
        return result(change, SyncItemStatus.APPLIED,
                deleted.getRevision(), BabyService.toResponse(deleted));
    }

    private BabyInput parseBabyData(JsonNode data, BabyEntity existing) {
        String name = BabyValidator.normalizeName(requireText(data, "name"));
        String genderRaw = optionalText(data, "gender");
        String gender = genderRaw == null
                ? (existing == null ? "UNKNOWN" : existing.getGender())
                : BabyValidator.normalizeGender(genderRaw);
        LocalDate birthDate = parseDate(data, "birthDate", true);
        BabyValidator.validateBirthDate(birthDate, TimeUtils.todayUtc());

        Boolean requestedDefault = optionalBoolean(data, "isDefault");
        boolean isDefault = requestedDefault != null
                ? requestedDefault
                : existing != null && Boolean.TRUE.equals(existing.getIsDefault());
        return new BabyInput(name, gender, birthDate, isDefault);
    }

    // ---------------------------------------------------------------- feeding

    private SyncItemResult upsertFeeding(DeviceContext.Identity device,
                                         SyncChangeRequest change) {
        FeedingRecordEntity existing = feedingMapper.selectAnyById(change.id());
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), feedingService.toResponse(existing));
            }
            int baseRevision = change.baseRevision();
            if (baseRevision == 0) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), feedingService.toResponse(existing));
            }
            if (baseRevision != existing.getRevision()) {
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        existing.getRevision(), feedingService.toResponse(existing));
            }

            FeedingInput input = parseFeedingData(change.data());
            if (!input.babyId().equals(existing.getBabyId())) {
                throw ValidationExceptions.field("babyId",
                        "不允许通过同步修改 babyId");
            }
            validateFeedingInput(device, input);

            LocalDateTime now = TimeUtils.nowUtcLocal();
            LambdaUpdateWrapper<FeedingRecordEntity> update = Wrappers.lambdaUpdate();
            update.eq(FeedingRecordEntity::getId, change.id())
                    .eq(FeedingRecordEntity::getDeviceId, device.deviceRowId())
                    .isNull(FeedingRecordEntity::getDeletedAt)
                    .eq(FeedingRecordEntity::getRevision, baseRevision)
                    .set(FeedingRecordEntity::getFeedType, input.feedType().name())
                    .set(FeedingRecordEntity::getBreastSide,
                            input.breastSide() == null ? null : input.breastSide().name())
                    .set(FeedingRecordEntity::getAmountValue, input.amountValue())
                    .set(FeedingRecordEntity::getAmountUnit,
                            input.amountUnit() == null ? null : input.amountUnit().name())
                    .set(FeedingRecordEntity::getDurationSec, input.durationSec())
                    .set(FeedingRecordEntity::getNote, input.note())
                    .set(FeedingRecordEntity::getTags, tagCodec.toJson(input.tags()))
                    .set(FeedingRecordEntity::getStartedAt, TimeUtils.toUtc(input.startedAt()))
                    .set(FeedingRecordEntity::getEndedAt, input.endedAt() == null
                            ? null : TimeUtils.toUtc(input.endedAt()))
                    .set(FeedingRecordEntity::getTzOffsetMinutes,
                            TimeUtils.tzOffsetMinutes(input.startedAt()))
                    .set(FeedingRecordEntity::getRecordDate,
                            TimeUtils.recordDate(input.startedAt()))
                    .set(FeedingRecordEntity::getRevision, baseRevision + 1)
                    .set(FeedingRecordEntity::getUpdatedAt, now);
            if (feedingMapper.update(null, update) == 0) {
                FeedingRecordEntity latest = feedingMapper.selectAnyById(change.id());
                if (latest == null) {
                    throw notFound();
                }
                ensureOwned(device, latest);
                if (latest.getDeletedAt() != null) {
                    return result(change, SyncItemStatus.DUPLICATE,
                            latest.getRevision(), feedingService.toResponse(latest));
                }
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        latest.getRevision(), feedingService.toResponse(latest));
            }

            FeedingRecordEntity updated = feedingMapper.selectAnyById(change.id());
            bumpStatsVersion(device, updated.getBabyId());
            return result(change, SyncItemStatus.APPLIED,
                    updated.getRevision(), feedingService.toResponse(updated));
        }

        if (change.baseRevision() != 0) {
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS, null, null);
        }

        FeedingInput input = parseFeedingData(change.data());
        validateFeedingInput(device, input);

        LocalDateTime now = TimeUtils.nowUtcLocal();
        FeedingRecordEntity entity = new FeedingRecordEntity();
        entity.setId(change.id());
        entity.setDeviceId(device.deviceRowId());
        entity.setBabyId(input.babyId());
        entity.setFeedType(input.feedType().name());
        entity.setBreastSide(input.breastSide() == null ? null : input.breastSide().name());
        entity.setAmountValue(input.amountValue());
        entity.setAmountUnit(input.amountUnit() == null ? null : input.amountUnit().name());
        entity.setDurationSec(input.durationSec());
        entity.setNote(input.note());
        entity.setTags(tagCodec.toJson(input.tags()));
        entity.setStartedAt(TimeUtils.toUtc(input.startedAt()));
        entity.setEndedAt(input.endedAt() == null ? null : TimeUtils.toUtc(input.endedAt()));
        entity.setTzOffsetMinutes(TimeUtils.tzOffsetMinutes(input.startedAt()));
        entity.setRecordDate(TimeUtils.recordDate(input.startedAt()));
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        try {
            feedingMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            FeedingRecordEntity raced = feedingMapper.selectAnyById(change.id());
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            return result(change, SyncItemStatus.DUPLICATE,
                    raced.getRevision(), feedingService.toResponse(raced));
        }

        bumpStatsVersion(device, entity.getBabyId());
        return result(change, SyncItemStatus.APPLIED, 1,
                feedingService.toResponse(entity));
    }

    private SyncItemResult deleteFeeding(DeviceContext.Identity device,
                                         SyncChangeRequest change) {
        FeedingRecordEntity any = feedingMapper.selectAnyById(change.id());
        if (any == null) {
            return result(change, SyncItemStatus.DUPLICATE, null, null);
        }
        ensureOwned(device, any);
        if (any.getDeletedAt() != null) {
            return result(change, SyncItemStatus.DUPLICATE,
                    any.getRevision(), feedingService.toResponse(any));
        }
        int baseRevision = change.baseRevision();
        if (baseRevision != any.getRevision()) {
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    any.getRevision(), feedingService.toResponse(any));
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<FeedingRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(FeedingRecordEntity::getId, change.id())
                .eq(FeedingRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(FeedingRecordEntity::getDeletedAt)
                .eq(FeedingRecordEntity::getRevision, baseRevision)
                .set(FeedingRecordEntity::getDeletedAt, now)
                .set(FeedingRecordEntity::getRevision, baseRevision + 1)
                .set(FeedingRecordEntity::getUpdatedAt, now);
        if (feedingMapper.update(null, update) == 0) {
            FeedingRecordEntity latest = feedingMapper.selectAnyById(change.id());
            if (latest == null) {
                throw notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        latest.getRevision(), feedingService.toResponse(latest));
            }
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    latest.getRevision(), feedingService.toResponse(latest));
        }

        bumpStatsVersion(device, any.getBabyId());
        FeedingRecordEntity deleted = feedingMapper.selectAnyById(change.id());
        return result(change, SyncItemStatus.APPLIED,
                deleted.getRevision(), feedingService.toResponse(deleted));
    }

    private FeedingInput parseFeedingData(JsonNode data) {
        String babyId = UuidUtils.requireUuidV4("babyId",
                requireText(data, "babyId"));
        FeedingType feedType = FeedingType.parse("feedType",
                requireText(data, "feedType"));
        BreastSide breastSide = BreastSide.parseNullable("breastSide",
                optionalText(data, "breastSide"));
        BigDecimal amountValue = FeedingValidator.parseAmount(data.get("amountValue"));
        AmountUnit amountUnit = AmountUnit.parseNullable("amountUnit",
                optionalText(data, "amountUnit"));
        Integer durationSec = optionalInt(data, "durationSec");
        String note = FeedingValidator.parseNote(optionalText(data, "note"));
        List<FeedingTag> tags = parseTags(data.get("tags"));
        OffsetDateTime startedAt = FeedingValidator.parseStartedAt(
                requireText(data, "startedAt"));
        OffsetDateTime endedAt = FeedingValidator.parseEndedAtNullable(
                optionalText(data, "endedAt"));

        FeedingValidator.validateMatrix(feedType, breastSide, amountValue,
                amountUnit, durationSec);
        return new FeedingInput(babyId, feedType, breastSide, amountValue, amountUnit,
                durationSec, note, tags, startedAt, endedAt);
    }

    private void validateFeedingInput(DeviceContext.Identity device, FeedingInput input) {
        BabyEntity baby = requireActiveBaby(device, input.babyId());
        FeedingValidator.validateTimes(input.startedAt(), input.endedAt(),
                baby.getBirthDate(), TimeUtils.now());
    }

    // ----------------------------------------------------------------- growth

    private SyncItemResult upsertGrowth(DeviceContext.Identity device,
                                        SyncChangeRequest change) {
        GrowthRecordEntity existing = growthMapper.selectAnyById(change.id());
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), growthService.toResponse(existing));
            }
            int baseRevision = change.baseRevision();
            if (baseRevision == 0) {
                return result(change, SyncItemStatus.DUPLICATE,
                        existing.getRevision(), growthService.toResponse(existing));
            }
            if (baseRevision != existing.getRevision()) {
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        existing.getRevision(), growthService.toResponse(existing));
            }

            GrowthInput input = parseGrowthData(change.data());
            if (!input.babyId().equals(existing.getBabyId())) {
                throw ValidationExceptions.field("babyId",
                        "不允许通过同步修改 babyId");
            }
            validateGrowthInput(device, input);

            LocalDateTime now = TimeUtils.nowUtcLocal();
            LambdaUpdateWrapper<GrowthRecordEntity> update = Wrappers.lambdaUpdate();
            update.eq(GrowthRecordEntity::getId, change.id())
                    .eq(GrowthRecordEntity::getDeviceId, device.deviceRowId())
                    .isNull(GrowthRecordEntity::getDeletedAt)
                    .eq(GrowthRecordEntity::getRevision, baseRevision)
                    .set(GrowthRecordEntity::getMeasuredOn, input.measuredOn())
                    .set(GrowthRecordEntity::getHeightCm, input.heightCm())
                    .set(GrowthRecordEntity::getWeightKg, input.weightKg())
                    .set(GrowthRecordEntity::getHeadCircumferenceCm,
                            input.headCircumferenceCm())
                    .set(GrowthRecordEntity::getNote, input.note())
                    .set(GrowthRecordEntity::getRevision, baseRevision + 1)
                    .set(GrowthRecordEntity::getUpdatedAt, now);
            if (growthMapper.update(null, update) == 0) {
                GrowthRecordEntity latest = growthMapper.selectAnyById(change.id());
                if (latest == null) {
                    throw notFound();
                }
                ensureOwned(device, latest);
                if (latest.getDeletedAt() != null) {
                    return result(change, SyncItemStatus.DUPLICATE,
                            latest.getRevision(), growthService.toResponse(latest));
                }
                return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                        latest.getRevision(), growthService.toResponse(latest));
            }

            GrowthRecordEntity updated = growthMapper.selectAnyById(change.id());
            return result(change, SyncItemStatus.APPLIED,
                    updated.getRevision(), growthService.toResponse(updated));
        }

        if (change.baseRevision() != 0) {
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS, null, null);
        }

        GrowthInput input = parseGrowthData(change.data());
        validateGrowthInput(device, input);

        LocalDateTime now = TimeUtils.nowUtcLocal();
        GrowthRecordEntity entity = new GrowthRecordEntity();
        entity.setId(change.id());
        entity.setDeviceId(device.deviceRowId());
        entity.setBabyId(input.babyId());
        entity.setMeasuredOn(input.measuredOn());
        entity.setHeightCm(input.heightCm());
        entity.setWeightKg(input.weightKg());
        entity.setHeadCircumferenceCm(input.headCircumferenceCm());
        entity.setNote(input.note());
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        try {
            growthMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            GrowthRecordEntity raced = growthMapper.selectAnyById(change.id());
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            return result(change, SyncItemStatus.DUPLICATE,
                    raced.getRevision(), growthService.toResponse(raced));
        }
        return result(change, SyncItemStatus.APPLIED, 1,
                growthService.toResponse(entity));
    }

    private SyncItemResult deleteGrowth(DeviceContext.Identity device,
                                        SyncChangeRequest change) {
        GrowthRecordEntity any = growthMapper.selectAnyById(change.id());
        if (any == null) {
            return result(change, SyncItemStatus.DUPLICATE, null, null);
        }
        ensureOwned(device, any);
        if (any.getDeletedAt() != null) {
            return result(change, SyncItemStatus.DUPLICATE,
                    any.getRevision(), growthService.toResponse(any));
        }
        int baseRevision = change.baseRevision();
        if (baseRevision != any.getRevision()) {
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    any.getRevision(), growthService.toResponse(any));
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<GrowthRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(GrowthRecordEntity::getId, change.id())
                .eq(GrowthRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(GrowthRecordEntity::getDeletedAt)
                .eq(GrowthRecordEntity::getRevision, baseRevision)
                .set(GrowthRecordEntity::getDeletedAt, now)
                .set(GrowthRecordEntity::getRevision, baseRevision + 1)
                .set(GrowthRecordEntity::getUpdatedAt, now);
        if (growthMapper.update(null, update) == 0) {
            GrowthRecordEntity latest = growthMapper.selectAnyById(change.id());
            if (latest == null) {
                throw notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return result(change, SyncItemStatus.DUPLICATE,
                        latest.getRevision(), growthService.toResponse(latest));
            }
            return result(change, SyncItemStatus.CONFLICT_SERVER_WINS,
                    latest.getRevision(), growthService.toResponse(latest));
        }

        GrowthRecordEntity deleted = growthMapper.selectAnyById(change.id());
        return result(change, SyncItemStatus.APPLIED,
                deleted.getRevision(), growthService.toResponse(deleted));
    }

    private GrowthInput parseGrowthData(JsonNode data) {
        String babyId = UuidUtils.requireUuidV4("babyId",
                requireText(data, "babyId"));
        LocalDate measuredOn = GrowthValidator.parseMeasuredOn(
                requireText(data, "measuredOn"));
        BigDecimal heightCm = GrowthValidator.parseMetric("heightCm",
                data.get("heightCm"));
        BigDecimal weightKg = GrowthValidator.parseMetric("weightKg",
                data.get("weightKg"));
        BigDecimal headCircumferenceCm = GrowthValidator.parseMetric(
                "headCircumferenceCm", data.get("headCircumferenceCm"));
        String note = GrowthValidator.parseNote(optionalText(data, "note"));
        GrowthValidator.validateMetrics(heightCm, weightKg, headCircumferenceCm);
        return new GrowthInput(babyId, measuredOn, heightCm, weightKg,
                headCircumferenceCm, note);
    }

    private void validateGrowthInput(DeviceContext.Identity device, GrowthInput input) {
        BabyEntity baby = requireActiveBaby(device, input.babyId());
        GrowthValidator.validateMeasuredOn(input.measuredOn(), baby.getBirthDate(),
                TimeUtils.todayUtc());
    }

    // ---------------------------------------------------------------- helpers

    private BabyEntity requireActiveBaby(DeviceContext.Identity device, String babyId) {
        BabyEntity baby = babyMapper.selectActiveById(babyId, device.deviceRowId());
        if (baby == null) {
            throw notFound();
        }
        return baby;
    }

    private static void ensureOwned(DeviceContext.Identity device, BabyEntity entity) {
        if (!entity.getDeviceId().equals(device.deviceRowId())) {
            throw notFound();
        }
    }

    private static void ensureOwned(DeviceContext.Identity device,
                                    FeedingRecordEntity entity) {
        if (!entity.getDeviceId().equals(device.deviceRowId())) {
            throw notFound();
        }
    }

    private static void ensureOwned(DeviceContext.Identity device,
                                    GrowthRecordEntity entity) {
        if (!entity.getDeviceId().equals(device.deviceRowId())) {
            throw notFound();
        }
    }

    private void bumpStatsVersion(DeviceContext.Identity device, String babyId) {
        redisCache.increment(redisKeys.statsVersion(device.hashHex(), babyId),
                STATS_VERSION_TTL);
    }

    private SyncItemResult rejected(SyncChangeRequest change, BusinessException ex) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", ex.getErrorCode().getCode());
        error.put("message", ex.getMessage());
        if (ex.getData() instanceof Map<?, ?> data && data.get("fieldErrors") != null) {
            error.put("fieldErrors", data.get("fieldErrors"));
        }
        return new SyncItemResult(change.entityType(), change.id(),
                SyncItemStatus.REJECTED.name(), null, null, error);
    }

    private SyncItemResult result(SyncChangeRequest change,
                                  SyncItemStatus status,
                                  Integer revision,
                                  Object record) {
        return new SyncItemResult(change.entityType(), change.id(), status.name(),
                revision, record == null ? null : objectMapper.valueToTree(record), null);
    }

    private static SyncSummary summarize(List<SyncItemResult> results) {
        int applied = 0;
        int duplicate = 0;
        int conflict = 0;
        int rejected = 0;
        for (SyncItemResult result : results) {
            switch (SyncItemStatus.valueOf(result.status())) {
                case APPLIED -> applied++;
                case DUPLICATE -> duplicate++;
                case CONFLICT_SERVER_WINS -> conflict++;
                case REJECTED -> rejected++;
            }
        }
        return new SyncSummary(applied, duplicate, conflict, rejected);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND);
    }

    // --------------------------------------------------------- JSON accessors

    private static String requireText(JsonNode data, String field) {
        JsonNode node = data == null ? null : data.get(field);
        if (node == null || node.isNull()) {
            throw ValidationExceptions.field(field, field + " 必填");
        }
        if (!node.isTextual()) {
            throw ValidationExceptions.field(field, field + " 必须是字符串");
        }
        return node.textValue();
    }

    private static String optionalText(JsonNode data, String field) {
        JsonNode node = data == null ? null : data.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isTextual()) {
            throw ValidationExceptions.field(field, field + " 必须是字符串");
        }
        return node.textValue();
    }

    private static Integer optionalInt(JsonNode data, String field) {
        JsonNode node = data == null ? null : data.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isIntegralNumber() || !node.canConvertToInt()) {
            throw ValidationExceptions.field(field, field + " 必须是整数");
        }
        return node.intValue();
    }

    private static Boolean optionalBoolean(JsonNode data, String field) {
        JsonNode node = data == null ? null : data.get(field);
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isBoolean()) {
            throw ValidationExceptions.field(field, field + " 必须是布尔值");
        }
        return node.booleanValue();
    }

    private static LocalDate parseDate(JsonNode data, String field, boolean required) {
        String raw = required ? requireText(data, field) : optionalText(data, field);
        if (raw == null) {
            return null;
        }
        try {
            return LocalDate.parse(raw);
        } catch (DateTimeParseException ex) {
            throw ValidationExceptions.field(field, field + " 必须是 YYYY-MM-DD");
        }
    }

    private static List<FeedingTag> parseTags(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (!node.isArray()) {
            throw ValidationExceptions.field("tags", "tags 必须是数组");
        }
        List<String> codes = new ArrayList<>();
        for (JsonNode item : node) {
            if (item == null || !item.isTextual()) {
                throw ValidationExceptions.field("tags", "标签必须是字符串");
            }
            codes.add(item.textValue());
        }
        return FeedingValidator.parseTags(codes);
    }

    private record BabyInput(String name,
                             String gender,
                             LocalDate birthDate,
                             boolean isDefault) {
    }

    private record FeedingInput(String babyId,
                                FeedingType feedType,
                                BreastSide breastSide,
                                BigDecimal amountValue,
                                AmountUnit amountUnit,
                                Integer durationSec,
                                String note,
                                List<FeedingTag> tags,
                                OffsetDateTime startedAt,
                                OffsetDateTime endedAt) {
    }

    private record GrowthInput(String babyId,
                               LocalDate measuredOn,
                               BigDecimal heightCm,
                               BigDecimal weightKg,
                               BigDecimal headCircumferenceCm,
                               String note) {
    }
}
