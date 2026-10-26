package com.zz.babyfeeding.device;

import com.baomidou.mybatisplus.core.toolkit.Wrappers;
import com.zz.babyfeeding.common.api.ValidationExceptions;
import com.zz.babyfeeding.common.security.DeviceIdHasher;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.web.DeviceRegistry;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * Anonymous device registration. Only the HMAC digest is persisted. Repeating
 * init is idempotent and refreshes last_seen_at/app_version.
 */
@Service
public class DeviceService {

    private static final String DEFAULT_PLATFORM = "H5";
    private static final int MAX_APP_VERSION_LENGTH = 32;

    private final DeviceMapper deviceMapper;
    private final DeviceIdHasher deviceIdHasher;
    private final DeviceRegistry deviceRegistry;

    public DeviceService(DeviceMapper deviceMapper,
                         DeviceIdHasher deviceIdHasher,
                         DeviceRegistry deviceRegistry) {
        this.deviceMapper = deviceMapper;
        this.deviceIdHasher = deviceIdHasher;
        this.deviceRegistry = deviceRegistry;
    }

    @Transactional
    public InitResult init(String normalizedDeviceId, String platform, String appVersion) {
        String resolvedPlatform = platform == null || platform.isBlank()
                ? DEFAULT_PLATFORM : platform;
        if (!DEFAULT_PLATFORM.equals(resolvedPlatform)) {
            throw ValidationExceptions.field("platform", "platform 仅支持 H5");
        }
        if (appVersion != null && appVersion.length() > MAX_APP_VERSION_LENGTH) {
            throw ValidationExceptions.field("appVersion", "appVersion 最长 32 字符");
        }

        byte[] hash = deviceIdHasher.hash(normalizedDeviceId);
        String hashHex = DeviceIdHasher.toHex(hash);

        DeviceEntity existing = findByHash(hash);
        if (existing != null) {
            return refresh(existing, resolvedPlatform, appVersion, hashHex);
        }

        LocalDateTime now = TimeUtils.nowUtcLocal();
        DeviceEntity entity = new DeviceEntity();
        entity.setDeviceUidHash(hash);
        entity.setPlatform(resolvedPlatform);
        entity.setAppVersion(appVersion);
        entity.setStatus("ACTIVE");
        entity.setFirstSeenAt(now);
        entity.setLastSeenAt(now);
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);

        try {
            deviceMapper.insert(entity);
            deviceRegistry.evict(hashHex);
            return new InitResult(true, TimeUtils.utcToInstant(entity.getFirstSeenAt()));
        } catch (DuplicateKeyException ex) {
            // Concurrent init for the same device: treat as idempotent.
            DeviceEntity raced = findByHash(hash);
            if (raced == null) {
                throw ex;
            }
            return refresh(raced, resolvedPlatform, appVersion, hashHex);
        }
    }

    private InitResult refresh(DeviceEntity existing, String platform, String appVersion,
                               String hashHex) {
        LocalDateTime now = TimeUtils.nowUtcLocal();
        existing.setLastSeenAt(now);
        existing.setUpdatedAt(now);
        existing.setPlatform(platform);
        if (appVersion != null) {
            existing.setAppVersion(appVersion);
        }
        deviceMapper.updateById(existing);
        deviceRegistry.evict(hashHex);
        return new InitResult(false, TimeUtils.utcToInstant(existing.getFirstSeenAt()));
    }

    private DeviceEntity findByHash(byte[] hash) {
        return deviceMapper.selectOne(Wrappers.<DeviceEntity>lambdaQuery()
                .eq(DeviceEntity::getDeviceUidHash, hash));
    }

    public record InitResult(boolean created, Instant firstSeenAt) {
    }
}
