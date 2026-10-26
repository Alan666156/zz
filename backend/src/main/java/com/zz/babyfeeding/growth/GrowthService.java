package com.zz.babyfeeding.growth;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.zz.babyfeeding.baby.BabyEntity;
import com.zz.babyfeeding.baby.BabyMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.api.PageResult;
import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.growth.dto.CreateGrowthRecordRequest;
import com.zz.babyfeeding.growth.dto.CreateGrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.DeleteGrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.GrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.PatchGrowthRecordRequest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Growth-record CRUD with device isolation and online tombstone semantics
 * (Q-05/Q-06). Metrics keep the contract scale in responses (Q-02).
 */
@Service
public class GrowthService {

    private final GrowthRecordMapper growthMapper;
    private final BabyMapper babyMapper;

    public GrowthService(GrowthRecordMapper growthMapper, BabyMapper babyMapper) {
        this.growthMapper = growthMapper;
        this.babyMapper = babyMapper;
    }

    @Transactional
    public CreateGrowthRecordResponse create(DeviceContext.Identity device,
                                             CreateGrowthRecordRequest request) {
        String id = UuidUtils.uuidV4OrGenerate("id", request.id());
        String babyId = UuidUtils.requireUuidV4("babyId", request.babyId());

        GrowthRecordEntity existing = growthMapper.selectAnyById(id);
        if (existing != null) {
            ensureOwned(device, existing);
            if (existing.getDeletedAt() != null) {
                throw notFound();
            }
            return new CreateGrowthRecordResponse(false, toResponse(existing));
        }

        LocalDate measuredOn = GrowthValidator.parseMeasuredOn(request.measuredOn());
        BigDecimal heightCm = GrowthValidator.parseMetric("heightCm", request.heightCm());
        BigDecimal weightKg = GrowthValidator.parseMetric("weightKg", request.weightKg());
        BigDecimal headCm = GrowthValidator.parseMetric(
                "headCircumferenceCm", request.headCircumferenceCm());
        String note = GrowthValidator.parseNote(request.note());
        GrowthValidator.validateMetrics(heightCm, weightKg, headCm);

        BabyEntity baby = requireActiveBaby(device, babyId);
        GrowthValidator.validateMeasuredOn(measuredOn, baby.getBirthDate(),
                TimeUtils.todayUtc());

        LocalDateTime now = TimeUtils.nowUtcLocal();
        GrowthRecordEntity entity = new GrowthRecordEntity();
        entity.setId(id);
        entity.setDeviceId(device.deviceRowId());
        entity.setBabyId(babyId);
        entity.setMeasuredOn(measuredOn);
        entity.setHeightCm(heightCm);
        entity.setWeightKg(weightKg);
        entity.setHeadCircumferenceCm(headCm);
        entity.setNote(note);
        entity.setRevision(1);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        try {
            growthMapper.insert(entity);
        } catch (DuplicateKeyException ex) {
            GrowthRecordEntity raced = growthMapper.selectAnyById(id);
            if (raced == null) {
                throw ex;
            }
            ensureOwned(device, raced);
            if (raced.getDeletedAt() != null) {
                throw notFound();
            }
            return new CreateGrowthRecordResponse(false, toResponse(raced));
        }

        return new CreateGrowthRecordResponse(true, toResponse(entity));
    }

    @Transactional(readOnly = true)
    public GrowthRecordResponse get(DeviceContext.Identity device, String recordId) {
        String id = UuidUtils.requireUuidV4("id", recordId);
        GrowthRecordEntity entity = growthMapper.selectActiveById(id, device.deviceRowId());
        if (entity == null) {
            throw notFound();
        }
        return toResponse(entity);
    }

    @Transactional(readOnly = true)
    public PageResult<GrowthRecordResponse> list(DeviceContext.Identity device,
                                                 String babyIdRaw,
                                                 String fromRaw,
                                                 String toRaw,
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

        boolean hasFrom = fromRaw != null && !fromRaw.isBlank();
        boolean hasTo = toRaw != null && !toRaw.isBlank();
        LocalDate from = hasFrom ? GrowthValidator.parseQueryDate("from", fromRaw) : null;
        LocalDate to = hasTo ? GrowthValidator.parseQueryDate("to", toRaw) : null;
        if (from != null && to != null) {
            GrowthValidator.validateRange("from", from, to);
        }

        requireActiveBaby(device, babyId);

        long offset = (long) (page - 1) * size;
        List<GrowthRecordEntity> rows = growthMapper.listPage(
                device.deviceRowId(), babyId, from, to, offset, size);
        long total = growthMapper.countPage(device.deviceRowId(), babyId, from, to);
        return PageResult.of(rows.stream().map(this::toResponse).toList(), page, size, total);
    }

    @Transactional(readOnly = true)
    public GrowthRecordResponse latest(DeviceContext.Identity device, String babyIdRaw) {
        String babyId = UuidUtils.requireUuidV4("babyId", babyIdRaw);
        requireActiveBaby(device, babyId);
        GrowthRecordEntity entity = growthMapper.selectLatest(device.deviceRowId(), babyId);
        return entity == null ? null : toResponse(entity);
    }

    @Transactional
    public GrowthRecordResponse patch(DeviceContext.Identity device,
                                      String recordId,
                                      PatchGrowthRecordRequest request) {
        if (request.isBabyIdPresent()) {
            throw ValidationExceptions.field("babyId", "不允许通过 PATCH 修改 babyId");
        }
        String id = UuidUtils.requireUuidV4("id", recordId);
        Integer baseRevision = request.getBaseRevision();
        requireBaseRevision(baseRevision);

        GrowthRecordEntity current = growthMapper.selectActiveById(id, device.deviceRowId());
        if (current == null) {
            throw notFound();
        }
        if (!baseRevision.equals(current.getRevision())) {
            throw conflict(current);
        }

        LocalDate measuredOn = request.isMeasuredOnPresent()
                ? GrowthValidator.parseMeasuredOn(request.getMeasuredOn())
                : current.getMeasuredOn();
        BigDecimal heightCm = request.isHeightCmPresent()
                ? GrowthValidator.parseMetric("heightCm", request.getHeightCm())
                : current.getHeightCm();
        BigDecimal weightKg = request.isWeightKgPresent()
                ? GrowthValidator.parseMetric("weightKg", request.getWeightKg())
                : current.getWeightKg();
        BigDecimal headCm = request.isHeadCircumferenceCmPresent()
                ? GrowthValidator.parseMetric("headCircumferenceCm",
                        request.getHeadCircumferenceCm())
                : current.getHeadCircumferenceCm();
        String note = request.isNotePresent()
                ? GrowthValidator.parseNote(request.getNote()) : current.getNote();

        GrowthValidator.validateMetrics(heightCm, weightKg, headCm);
        BabyEntity baby = requireActiveBaby(device, current.getBabyId());
        GrowthValidator.validateMeasuredOn(measuredOn, baby.getBirthDate(),
                TimeUtils.todayUtc());

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<GrowthRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(GrowthRecordEntity::getId, id)
                .eq(GrowthRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(GrowthRecordEntity::getDeletedAt)
                .eq(GrowthRecordEntity::getRevision, baseRevision)
                .set(GrowthRecordEntity::getMeasuredOn, measuredOn)
                .set(GrowthRecordEntity::getHeightCm, heightCm)
                .set(GrowthRecordEntity::getWeightKg, weightKg)
                .set(GrowthRecordEntity::getHeadCircumferenceCm, headCm)
                .set(GrowthRecordEntity::getNote, note)
                .set(GrowthRecordEntity::getRevision, baseRevision + 1)
                .set(GrowthRecordEntity::getUpdatedAt, now);

        if (growthMapper.update(null, update) == 0) {
            GrowthRecordEntity latest =
                    growthMapper.selectActiveById(id, device.deviceRowId());
            if (latest == null) {
                throw notFound();
            }
            throw conflict(latest);
        }

        return toResponse(growthMapper.selectActiveById(id, device.deviceRowId()));
    }

    @Transactional
    public DeleteGrowthRecordResponse delete(DeviceContext.Identity device,
                                             String recordId,
                                             Integer baseRevision) {
        String id = UuidUtils.requireUuidV4("id", recordId);
        requireBaseRevision(baseRevision);

        GrowthRecordEntity any = growthMapper.selectAnyById(id);
        if (any == null) {
            throw notFound();
        }
        ensureOwned(device, any);

        if (any.getDeletedAt() != null) {
            return new DeleteGrowthRecordResponse(id, any.getRevision(),
                    TimeUtils.utcToInstant(any.getDeletedAt()), true);
        }
        if (!baseRevision.equals(any.getRevision())) {
            throw conflict(any);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        LambdaUpdateWrapper<GrowthRecordEntity> update = Wrappers.lambdaUpdate();
        update.eq(GrowthRecordEntity::getId, id)
                .eq(GrowthRecordEntity::getDeviceId, device.deviceRowId())
                .isNull(GrowthRecordEntity::getDeletedAt)
                .eq(GrowthRecordEntity::getRevision, baseRevision)
                .set(GrowthRecordEntity::getDeletedAt, now)
                .set(GrowthRecordEntity::getRevision, baseRevision + 1)
                .set(GrowthRecordEntity::getUpdatedAt, now);

        if (growthMapper.update(null, update) == 0) {
            GrowthRecordEntity latest = growthMapper.selectAnyById(id);
            if (latest == null) {
                throw notFound();
            }
            ensureOwned(device, latest);
            if (latest.getDeletedAt() != null) {
                return new DeleteGrowthRecordResponse(id, latest.getRevision(),
                        TimeUtils.utcToInstant(latest.getDeletedAt()), true);
            }
            throw conflict(latest);
        }

        return new DeleteGrowthRecordResponse(
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

    private static void ensureOwned(DeviceContext.Identity device, GrowthRecordEntity entity) {
        if (!entity.getDeviceId().equals(device.deviceRowId())) {
            throw notFound();
        }
    }

    private GrowthRecordResponse toResponse(GrowthRecordEntity entity) {
        return new GrowthRecordResponse(
                entity.getId(),
                entity.getBabyId(),
                entity.getMeasuredOn(),
                GrowthValidator.heightScale(entity.getHeightCm()),
                GrowthValidator.weightScale(entity.getWeightKg()),
                GrowthValidator.heightScale(entity.getHeadCircumferenceCm()),
                entity.getNote(),
                entity.getRevision(),
                TimeUtils.utcToInstant(entity.getCreatedAt()),
                TimeUtils.utcToInstant(entity.getUpdatedAt()),
                TimeUtils.utcToInstant(entity.getDeletedAt()));
    }

    private BusinessException conflict(GrowthRecordEntity current) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("current", toResponse(current));
        return new BusinessException(ErrorCode.CONFLICT, "数据版本冲突", data);
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND);
    }
}
