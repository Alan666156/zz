package com.zz.babyfeeding.baby;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.zz.babyfeeding.baby.dto.BabyResponse;
import com.zz.babyfeeding.baby.dto.CreateBabyRequest;
import com.zz.babyfeeding.baby.dto.CreateBabyResponse;
import com.zz.babyfeeding.baby.dto.DeleteBabyResponse;
import com.zz.babyfeeding.baby.dto.PatchBabyRequest;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.device.DeviceMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Baby profile CRUD with device isolation, max 5 active babies, default-baby
 * transitions and cascade soft delete of feeding/growth records.
 */
@Service
public class BabyService {

    static final int MAX_BABIES = 5;
    private static final Duration STATS_VERSION_TTL = Duration.ofDays(7);

    private final BabyMapper babyMapper;
    private final DeviceMapper deviceMapper;
    private final BabyCacheService babyCache;
    private final RedisCacheService redisCache;
    private final RedisKeys redisKeys;

    public BabyService(BabyMapper babyMapper,
                       DeviceMapper deviceMapper,
                       BabyCacheService babyCache,
                       RedisCacheService redisCache,
                       RedisKeys redisKeys) {
        this.babyMapper = babyMapper;
        this.deviceMapper = deviceMapper;
        this.babyCache = babyCache;
        this.redisCache = redisCache;
        this.redisKeys = redisKeys;
    }

    @Transactional(readOnly = true)
    public List<BabyResponse> list(DeviceContext.Identity device) {
        List<BabyEntity> babies = babyMapper.listActiveByDevice(device.deviceRowId());
        babies.forEach(baby -> babyCache.put(device.hashHex(), baby));
        return babies.stream().map(BabyService::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public BabyResponse get(DeviceContext.Identity device, String babyId) {
        return toResponse(requireActive(device, babyId));
    }

    @Transactional
    public CreateBabyResponse create(DeviceContext.Identity device, CreateBabyRequest request) {
        String id = BabyValidator.normalizeId(request.id());

        // Serialise per device so the 5-baby limit and default flag cannot race.
        deviceMapper.lockById(device.deviceRowId());

        // Idempotency by id: repeated POST on an active row returns it; a
        // tombstone is 404 and is never returned or revived online (Q-05/Q-06).
        BabyEntity existing = babyMapper.selectAnyById(id);
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                throw BabyValidator.notFound();
            }
            babyCache.put(device.hashHex(), existing);
            return new CreateBabyResponse(false, toResponse(existing));
        }

        String name = BabyValidator.normalizeName(request.name());
        String gender = BabyValidator.normalizeGender(request.gender());
        LocalDate birthDate = request.birthDate();
        BabyValidator.validateBirthDate(birthDate, TimeUtils.todayUtc());

        int activeCount = babyMapper.countActiveByDevice(device.deviceRowId());
        if (activeCount >= MAX_BABIES) {
            throw new BusinessException(ErrorCode.BABY_LIMIT_EXCEEDED);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        boolean isDefault = Boolean.TRUE.equals(request.isDefault()) || activeCount == 0;
        if (isDefault && activeCount > 0) {
            babyMapper.clearDefaultForDevice(device.deviceRowId(), id, now);
        }

        BabyEntity entity = new BabyEntity();
        entity.setId(id);
        entity.setDeviceId(device.deviceRowId());
        entity.setName(name);
        entity.setGender(gender);
        entity.setBirthDate(birthDate);
        entity.setIsDefault(isDefault);
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        try {
            babyMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            // Same id inserted concurrently (possibly by another device).
            BabyEntity raced = babyMapper.selectAnyById(id);
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            if (raced.getDeletedAt() != null) {
                throw BabyValidator.notFound();
            }
            return new CreateBabyResponse(false, toResponse(raced));
        }

        babyCache.put(device.hashHex(), entity);
        return new CreateBabyResponse(true, toResponse(entity));
    }

    @Transactional
    public BabyResponse patch(DeviceContext.Identity device, String babyId,
                              PatchBabyRequest request) {
        BabyValidator.requireBaseRevision(request.baseRevision());
        requireUuid(babyId);

        deviceMapper.lockById(device.deviceRowId());
        BabyEntity current = babyMapper.selectActiveById(babyId, device.deviceRowId());
        if (current == null) {
            throw BabyValidator.notFound();
        }
        if (!request.baseRevision().equals(current.getRevision())) {
            throw conflict(current);
        }

        String name = request.name() == null
                ? current.getName() : BabyValidator.normalizeName(request.name());
        String gender = request.gender() == null
                ? current.getGender() : BabyValidator.normalizeGender(request.gender());
        LocalDate birthDate = request.birthDate() == null
                ? current.getBirthDate() : request.birthDate();
        if (request.birthDate() != null) {
            BabyValidator.validateBirthDate(birthDate, TimeUtils.todayUtc());
        }

        boolean currentlyDefault = Boolean.TRUE.equals(current.getIsDefault());
        boolean newDefault = request.isDefault() == null
                ? currentlyDefault : request.isDefault();
        if (currentlyDefault && request.isDefault() != null && !request.isDefault()) {
            throw new BusinessException(ErrorCode.DEFAULT_BABY_REQUIRED);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        if (newDefault && !currentlyDefault) {
            babyMapper.clearDefaultForDevice(device.deviceRowId(), babyId, now);
        }

        LambdaUpdateWrapper<BabyEntity> update = Wrappers.lambdaUpdate();
        update.eq(BabyEntity::getId, babyId)
                .eq(BabyEntity::getDeviceId, device.deviceRowId())
                .isNull(BabyEntity::getDeletedAt)
                .eq(BabyEntity::getRevision, request.baseRevision())
                .set(BabyEntity::getName, name)
                .set(BabyEntity::getGender, gender)
                .set(BabyEntity::getBirthDate, birthDate)
                .set(BabyEntity::getIsDefault, newDefault)
                .set(BabyEntity::getRevision, request.baseRevision() + 1)
                .set(BabyEntity::getUpdatedAt, now);

        if (babyMapper.update(null, update) == 0) {
            BabyEntity latest = babyMapper.selectActiveById(babyId, device.deviceRowId());
            if (latest == null) {
                throw BabyValidator.notFound();
            }
            throw conflict(latest);
        }

        BabyEntity updated = babyMapper.selectActiveById(babyId, device.deviceRowId());
        babyCache.evict(device.hashHex(), babyId);
        return toResponse(updated);
    }

    @Transactional
    public DeleteBabyResponse delete(DeviceContext.Identity device, String babyId,
                                     Integer baseRevision) {
        BabyValidator.requireBaseRevision(baseRevision);
        requireUuid(babyId);

        deviceMapper.lockById(device.deviceRowId());
        BabyEntity any = babyMapper.selectAnyById(babyId);
        if (any == null) {
            throw BabyValidator.notFound();
        }
        ensureOwned(device, any);

        if (any.getDeletedAt() != null) {
            return new DeleteBabyResponse(any.getId(), any.getRevision(),
                    TimeUtils.utcToInstant(any.getDeletedAt()), 0, 0, true);
        }
        if (!baseRevision.equals(any.getRevision())) {
            throw conflict(any);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<BabyEntity> update = Wrappers.lambdaUpdate();
        update.eq(BabyEntity::getId, babyId)
                .eq(BabyEntity::getDeviceId, device.deviceRowId())
                .isNull(BabyEntity::getDeletedAt)
                .eq(BabyEntity::getRevision, baseRevision)
                .set(BabyEntity::getDeletedAt, now)
                .set(BabyEntity::getRevision, baseRevision + 1)
                .set(BabyEntity::getUpdatedAt, now);

        if (babyMapper.update(null, update) == 0) {
            BabyEntity latest = babyMapper.selectAnyById(babyId);
            if (latest == null) {
                throw BabyValidator.notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return new DeleteBabyResponse(latest.getId(), latest.getRevision(),
                        TimeUtils.utcToInstant(latest.getDeletedAt()), 0, 0, true);
            }
            throw conflict(latest);
        }

        int cascadedFeeding =
                babyMapper.softDeleteFeedingRecords(babyId, device.deviceRowId(), now);
        int cascadedGrowth =
                babyMapper.softDeleteGrowthRecords(babyId, device.deviceRowId(), now);

        if (Boolean.TRUE.equals(any.getIsDefault())) {
            BabyEntity next = babyMapper.selectEarliestActiveExcluding(
                    device.deviceRowId(), babyId);
            if (next != null) {
                babyMapper.markDefault(next.getId(), device.deviceRowId(), now);
                babyCache.evict(device.hashHex(), next.getId());
            }
        }

        babyCache.evict(device.hashHex(), babyId);
        // Cascaded feeding deletes change statistics; invalidate the stats cache version.
        redisCache.increment(redisKeys.statsVersion(device.hashHex(), babyId), STATS_VERSION_TTL);

        return new DeleteBabyResponse(babyId, baseRevision + 1,
                TimeUtils.utcToInstant(now), cascadedFeeding, cascadedGrowth, false);
    }

    private BabyEntity requireActive(DeviceContext.Identity device, String babyId) {
        requireUuid(babyId);
        Optional<BabyCacheService.BabyCacheEntry> cached =
                babyCache.get(device.hashHex(), babyId);
        if (cached.isPresent() && cached.get().deleted()) {
            throw BabyValidator.notFound();
        }
        BabyEntity entity = babyMapper.selectActiveById(babyId, device.deviceRowId());
        if (entity == null) {
            throw BabyValidator.notFound();
        }
        babyCache.put(device.hashHex(), entity);
        return entity;
    }

    private static void ensureOwned(DeviceContext.Identity device, BabyEntity baby) {
        if (!baby.getDeviceId().equals(device.deviceRowId())) {
            throw BabyValidator.notFound();
        }
    }

    private static void requireUuid(String babyId) {
        BabyValidator.requireUuidV4("babyId", babyId);
    }

    private static BusinessException conflict(BabyEntity current) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("current", toResponse(current));
        return new BusinessException(ErrorCode.CONFLICT, "数据版本冲突", data);
    }

    static BabyResponse toResponse(BabyEntity entity) {
        return new BabyResponse(
                entity.getId(),
                entity.getName(),
                entity.getGender(),
                entity.getBirthDate(),
                Boolean.TRUE.equals(entity.getIsDefault()),
                entity.getRevision() == null ? 0 : entity.getRevision(),
                TimeUtils.utcToInstant(entity.getCreatedAt()),
                TimeUtils.utcToInstant(entity.getUpdatedAt()),
                TimeUtils.utcToInstant(entity.getDeletedAt()));
    }
}
