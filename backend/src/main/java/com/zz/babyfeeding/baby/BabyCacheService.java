package com.zz.babyfeeding.baby;

import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * Device/baby ownership cache. Values carry revision/deleted/isDefault for
 * diagnostics and fast tombstone checks; write operations evict the entry.
 * Cache failures fall back to MySQL.
 */
@Service
public class BabyCacheService {

    private static final Duration BABY_CACHE_TTL = Duration.ofMinutes(30);

    private final RedisCacheService cacheService;
    private final RedisKeys redisKeys;

    public BabyCacheService(RedisCacheService cacheService, RedisKeys redisKeys) {
        this.cacheService = cacheService;
        this.redisKeys = redisKeys;
    }

    public Optional<BabyCacheEntry> get(String deviceHashHex, String babyId) {
        return cacheService.get(redisKeys.baby(deviceHashHex, babyId), BabyCacheEntry.class);
    }

    public void put(String deviceHashHex, BabyEntity baby) {
        cacheService.put(redisKeys.baby(deviceHashHex, baby.getId()),
                new BabyCacheEntry(
                        baby.getRevision() == null ? 0 : baby.getRevision(),
                        baby.getDeletedAt() != null,
                        Boolean.TRUE.equals(baby.getIsDefault())),
                BABY_CACHE_TTL);
    }

    public void evict(String deviceHashHex, String babyId) {
        cacheService.delete(redisKeys.baby(deviceHashHex, babyId));
    }

    public record BabyCacheEntry(int revision, boolean deleted, boolean isDefault) {
    }
}
