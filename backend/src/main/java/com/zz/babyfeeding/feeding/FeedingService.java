package com.zz.babyfeeding.feeding;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.zz.babyfeeding.baby.BabyEntity;
import com.zz.babyfeeding.baby.BabyMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.api.PageResult;
import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.feeding.dto.CreateFeedingRecordRequest;
import com.zz.babyfeeding.feeding.dto.CreateFeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.DeleteFeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.FeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.PatchFeedingRecordRequest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Feeding-record CRUD scoped to the calling device. Soft-deleted rows are never
 * exposed online (Q-05/Q-06); recordDate and the stored offset are derived from
 * startedAt, never from a client-supplied field.
 */
@Service
public class FeedingService {

    private static final Duration STATS_VERSION_TTL = Duration.ofDays(7);

    private final FeedingRecordMapper feedingMapper;
    private final BabyMapper babyMapper;
    private final FeedingTagCodec tagCodec;
    private final RedisCacheService redisCache;
    private final RedisKeys redisKeys;

    public FeedingService(FeedingRecordMapper feedingMapper,
                          BabyMapper babyMapper,
                          FeedingTagCodec tagCodec,
                          RedisCacheService redisCache,
                          RedisKeys redisKeys) {
        this.feedingMapper = feedingMapper;
        this.babyMapper = babyMapper;
        this.tagCodec = tagCodec;
        this.redisCache = redisCache;
        this.redisKeys = redisKeys;
    }

    @Transactional
    public CreateFeedingRecordResponse create(DeviceContext.Identity device,
                                              CreateFeedingRecordRequest request) {
        String id = UuidUtils.uuidV4OrGenerate("id", request.id());
        String babyId = UuidUtils.requireUuidV4("babyId", request.babyId());

        FeedingRecordEntity existing = feedingMapper.selectAnyById(id);
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                throw notFound();
            }
            return new CreateFeedingRecordResponse(false, toResponse(existing));
        }

        FeedingType feedType = FeedingType.parse("feedType", request.feedType());
        BreastSide breastSide = BreastSide.parseNullable("breastSide", request.breastSide());
        BigDecimal amountValue = FeedingValidator.parseAmount(request.amountValue());
        AmountUnit amountUnit = AmountUnit.parseNullable("amountUnit", request.amountUnit());
        Integer durationSec = request.durationSec();
        String note = FeedingValidator.parseNote(request.note());
        List<FeedingTag> tags = FeedingValidator.parseTags(request.tags());
        OffsetDateTime startedAt = FeedingValidator.parseStartedAt(request.startedAt());
        OffsetDateTime endedAt = FeedingValidator.parseEndedAtNullable(request.endedAt());

        FeedingValidator.validateMatrix(feedType, breastSide, amountValue, amountUnit, durationSec);

        BabyEntity baby = requireActiveBaby(device, babyId);
        FeedingValidator.validateTimes(startedAt, endedAt, baby.getBirthDate(), TimeUtils.now());

        LocalDateTime now = TimeUtils.nowUtcLocal();
        FeedingRecordEntity entity = new FeedingRecordEntity();
        entity.setId(id);
        entity.setDeviceId(device.deviceRowId());
        entity.setBabyId(babyId);
        entity.setFeedType(feedType.name());
        entity.setBreastSide(breastSide == null ? null : breastSide.name());
        entity.setAmountValue(amountValue);
        entity.setAmountUnit(amountUnit == null ? null : amountUnit.name());
        entity.setDurationSec(durationSec);
        entity.setNote(note);
        entity.setTags(tagCodec.toJson(tags));
        entity.setStartedAt(TimeUtils.toUtc(startedAt));
        entity.setEndedAt(endedAt == null ? null : TimeUtils.toUtc(endedAt));
        entity.setTzOffsetMinutes(TimeUtils.tzOffsetMinutes(startedAt));
        entity.setRecordDate(TimeUtils.recordDate(startedAt));
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        try {
            feedingMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            // Same id inserted concurrently; the row now exists, so replay the
            // idempotent branch instead of failing the request.
            FeedingRecordEntity raced = feedingMapper.selectAnyById(id);
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            if (raced.getDeletedAt() != null) {
                throw notFound();
            }
            return new CreateFeedingRecordResponse(false, toResponse(raced));
        }

        bumpStatsVersion(device, babyId);
        return new CreateFeedingRecordResponse(true, toResponse(entity));
    }

    @Transactional(readOnly = true)
    public FeedingRecordResponse get(DeviceContext.Identity device, String recordId) {
        String id = UuidUtils.requireUuidV4("id", recordId);
        FeedingRecordEntity entity = feedingMapper.selectActiveById(id, device.deviceRowId());
        if (entity == null) {
            throw notFound();
        }
        return toResponse(entity);
    }

    @Transactional(readOnly = true)
    public PageResult<FeedingRecordResponse> list(DeviceContext.Identity device,
                                                  String babyIdRaw,
                                                  String dateRaw,
                                                  String fromRaw,
                                                  String toRaw,
                                                  String feedTypeRaw,
                                                  Integer pageRaw,
                                                  Integer sizeRaw) {
        String babyId = UuidUtils.requireUuidV4("babyId", babyIdRaw);
        int page = pageRaw == null ? 1 : pageRaw;
        int size = sizeRaw == null ? 20 : sizeRaw;
        if (page < 1) {
            throw ValidationExceptions.field("page", "page 必须大于等于 1");
        }
        if (size < 1 || size > 100) {
            throw ValidationExceptions.field("size", "size 必须在 1-100 之间");
        }

        LocalDate from;
        LocalDate to;
        boolean hasDate = dateRaw != null && !dateRaw.isBlank();
        boolean hasFrom = fromRaw != null && !fromRaw.isBlank();
        boolean hasTo = toRaw != null && !toRaw.isBlank();
        if (hasDate && (hasFrom || hasTo)) {
            throw ValidationExceptions.field("date", "date 与 from/to 只能二选一");
        }
        if (hasDate) {
            from = FeedingValidator.parseQueryDate("date", dateRaw);
            to = from;
        } else if (hasFrom && hasTo) {
            from = FeedingValidator.parseQueryDate("from", fromRaw);
            to = FeedingValidator.parseQueryDate("to", toRaw);
            if (from.isAfter(to)) {
                throw ValidationExceptions.field("from", "from 不能晚于 to");
            }
            long spanDays = ChronoUnit.DAYS.between(from, to) + 1;
            if (spanDays > FeedingValidator.MAX_QUERY_RANGE_DAYS) {
                throw ValidationExceptions.field("from", "查询跨度不能超过 92 天");
            }
        } else {
            throw ValidationExceptions.field("from", "必须提供 date 或 from/to");
        }

        String feedType = null;
        if (feedTypeRaw != null) {
            feedType = FeedingType.parse("feedType", feedTypeRaw).name();
        }

        requireActiveBaby(device, babyId);

        long offset = (long) (page - 1) * size;
        List<FeedingRecordEntity> rows = feedingMapper.listPage(
                device.deviceRowId(), babyId, from, to, feedType, offset, size);
        long total = feedingMapper.countPage(
                device.deviceRowId(), babyId, from, to, feedType);
        return PageResult.of(rows.stream().map(this::toResponse).toList(), page, size, total);
    }

    @Transactional
    public FeedingRecordResponse patch(DeviceContext.Identity device,
                                       String recordId,
                                       PatchFeedingRecordRequest request) {
        // Q-04: babyId must not appear in the PATCH schema, even as null or the
        // current value. Presence is captured by Jackson.
        if (request.isBabyIdPresent()) {
            throw ValidationExceptions.field("babyId", "不允许通过 PATCH 修改 babyId");
        }
        String id = UuidUtils.requireUuidV4("id", recordId);
        Integer baseRevision = request.getBaseRevision();
        requireBaseRevision(baseRevision);

        FeedingRecordEntity current = feedingMapper.selectActiveById(id, device.deviceRowId());
        if (current == null) {
            throw notFound();
        }
        if (!baseRevision.equals(current.getRevision())) {
            throw conflict(current);
        }

        FeedingType feedType = request.isFeedTypePresent()
                ? FeedingType.parse("feedType", request.getFeedType())
                : FeedingType.valueOf(current.getFeedType());
        BreastSide breastSide = request.isBreastSidePresent()
                ? BreastSide.parseNullable("breastSide", request.getBreastSide())
                : BreastSide.parseNullable("breastSide", current.getBreastSide());
        BigDecimal amountValue = request.isAmountValuePresent()
                ? FeedingValidator.parseAmount(request.getAmountValue())
                : current.getAmountValue();
        AmountUnit amountUnit = request.isAmountUnitPresent()
                ? AmountUnit.parseNullable("amountUnit", request.getAmountUnit())
                : AmountUnit.parseNullable("amountUnit", current.getAmountUnit());
        Integer durationSec = request.isDurationSecPresent()
                ? request.getDurationSec() : current.getDurationSec();
        String note = request.isNotePresent()
                ? FeedingValidator.parseNote(request.getNote()) : current.getNote();
        List<FeedingTag> tags = request.isTagsPresent()
                ? FeedingValidator.parseTags(request.getTags())
                : tagCodec.toTags(tagCodec.fromJson(current.getTags()));
        OffsetDateTime startedAt = request.isStartedAtPresent()
                ? FeedingValidator.parseStartedAt(request.getStartedAt())
                : TimeUtils.fromUtc(current.getStartedAt(), current.getTzOffsetMinutes());
        OffsetDateTime endedAt = request.isEndedAtPresent()
                ? FeedingValidator.parseEndedAtNullable(request.getEndedAt())
                : current.getEndedAt() == null ? null
                : TimeUtils.fromUtc(current.getEndedAt(), current.getTzOffsetMinutes());

        FeedingValidator.validateMatrix(feedType, breastSide, amountValue, amountUnit, durationSec);
        BabyEntity baby = requireActiveBaby(device, current.getBabyId());
        FeedingValidator.validateTimes(startedAt, endedAt, baby.getBirthDate(), TimeUtils.now());

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<FeedingRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(FeedingRecordEntity::getId, id)
                .eq(FeedingRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(FeedingRecordEntity::getDeletedAt)
                .eq(FeedingRecordEntity::getRevision, baseRevision)
                .set(FeedingRecordEntity::getFeedType, feedType.name())
                .set(FeedingRecordEntity::getBreastSide,
                        breastSide == null ? null : breastSide.name())
                .set(FeedingRecordEntity::getAmountValue, amountValue)
                .set(FeedingRecordEntity::getAmountUnit,
                        amountUnit == null ? null : amountUnit.name())
                .set(FeedingRecordEntity::getDurationSec, durationSec)
                .set(FeedingRecordEntity::getNote, note)
                .set(FeedingRecordEntity::getTags, tagCodec.toJson(tags))
                .set(FeedingRecordEntity::getStartedAt, TimeUtils.toUtc(startedAt))
                .set(FeedingRecordEntity::getEndedAt,
                        endedAt == null ? null : TimeUtils.toUtc(endedAt))
                .set(FeedingRecordEntity::getTzOffsetMinutes,
                        TimeUtils.tzOffsetMinutes(startedAt))
                .set(FeedingRecordEntity::getRecordDate, TimeUtils.recordDate(startedAt))
                .set(FeedingRecordEntity::getRevision, baseRevision + 1)
                .set(FeedingRecordEntity::getUpdatedAt, now);

        if (feedingMapper.update(null, update) == 0) {
            FeedingRecordEntity latest =
                    feedingMapper.selectActiveById(id, device.deviceRowId());
            if (latest == null) {
                throw notFound();
            }
            throw conflict(latest);
        }

        FeedingRecordEntity updated =
                feedingMapper.selectActiveById(id, device.deviceRowId());
        bumpStatsVersion(device, updated.getBabyId());
        return toResponse(updated);
    }

    @Transactional
    public DeleteFeedingRecordResponse delete(DeviceContext.Identity device,
                                              String recordId,
                                              Integer baseRevision) {
        String id = UuidUtils.requireUuidV4("id", recordId);
        requireBaseRevision(baseRevision);

        FeedingRecordEntity any = feedingMapper.selectAnyById(id);
        if (any == null) {
            throw notFound();
        }
        ensureOwned(device, any);

        if (any.getDeletedAt() != null) {
            return new DeleteFeedingRecordResponse(id, any.getRevision(),
                    TimeUtils.utcToInstant(any.getDeletedAt()), true);
        }
        if (!baseRevision.equals(any.getRevision())) {
            throw conflict(any);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<FeedingRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(FeedingRecordEntity::getId, id)
                .eq(FeedingRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(FeedingRecordEntity::getDeletedAt)
                .eq(FeedingRecordEntity::getRevision, baseRevision)
                .set(FeedingRecordEntity::getDeletedAt, now)
                .set(FeedingRecordEntity::getRevision, baseRevision + 1)
                .set(FeedingRecordEntity::getUpdatedAt, now);

        if (feedingMapper.update(null, update) == 0) {
            FeedingRecordEntity latest = feedingMapper.selectAnyById(id);
            if (latest == null) {
                throw notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return new DeleteFeedingRecordResponse(id, latest.getRevision(),
                        TimeUtils.utcToInstant(latest.getDeletedAt()), true);
            }
            throw conflict(latest);
        }

        bumpStatsVersion(device, any.getBabyId());
        return new DeleteFeedingRecordResponse(
                id, baseRevision + 1, TimeUtils.utcToInstant(now), false);
    }

    // ---------------------------------------------------------------- helpers

    private BabyEntity requireActiveBaby(DeviceContext.Identity device, String babyId) {
        BabyEntity baby = babyMapper.selectActiveById(babyId, device.deviceRowId());
        if (baby == null) {
            throw notFound();
        }
        return baby;
    }

    private static void requireBaseRevision(Integer baseRevision) {
        if (baseRevision == null) {
            throw ValidationExceptions.field("baseRevision", "baseRevision 必填");
        }
        if (baseRevision < 1) {
            throw ValidationExceptions.field("baseRevision", "baseRevision 必须大于 0");
        }
    }

    private static void ensureOwned(DeviceContext.Identity device, FeedingRecordEntity entity) {
        if (!entity.getDeviceId().equals(device.deviceRowId())) {
            throw notFound();
        }
    }

    private void bumpStatsVersion(DeviceContext.Identity device, String babyId) {
        redisCache.increment(redisKeys.statsVersion(device.hashHex(), babyId),
                STATS_VERSION_TTL);
    }

    private FeedingRecordResponse toResponse(FeedingRecordEntity entity) {
        OffsetDateTime startedAt =
                TimeUtils.fromUtc(entity.getStartedAt(), entity.getTzOffsetMinutes());
        OffsetDateTime endedAt = entity.getEndedAt() == null ? null
                : TimeUtils.fromUtc(entity.getEndedAt(), entity.getTzOffsetMinutes());
        return new FeedingRecordResponse(
                entity.getId(),
                entity.getBabyId(),
                entity.getFeedType(),
                entity.getBreastSide(),
                FeedingValidator.normalizeAmount(entity.getAmountValue()),
                entity.getAmountUnit(),
                entity.getDurationSec(),
                TimeUtils.formatOffset(startedAt),
                TimeUtils.formatOffset(endedAt),
                entity.getRecordDate(),
                entity.getTzOffsetMinutes(),
                entity.getNote(),
                tagCodec.fromJson(entity.getTags()),
                entity.getRevision(),
                TimeUtils.utcToInstant(entity.getCreatedAt()),
                TimeUtils.utcToInstant(entity.getUpdatedAt()),
                TimeUtils.utcToInstant(entity.getDeletedAt()));
    }

    private BusinessException conflict(FeedingRecordEntity current) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("current", toResponse(current));
        return new BusinessException(ErrorCode.CONFLICT, "数据版本冲突", data);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND);
    }
}
