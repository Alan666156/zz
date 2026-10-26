package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.List;
import java.util.Optional;

/**
 * Resolves a device hash to its database row. Redis caches id/status for 30
 * minutes; cache failures fall back to MySQL. The raw device id is not stored
 * in the cache value.
 */
@Component
public class DeviceRegistry {

    private static final Duration DEVICE_CACHE_TTL = Duration.ofMinutes(30);

    private final JdbcTemplate jdbcTemplate;
    private final RedisCacheService cacheService;
    private final RedisKeys redisKeys;

    public DeviceRegistry(JdbcTemplate jdbcTemplate,
                          RedisCacheService cacheService,
                          RedisKeys redisKeys) {
        this.jdbcTemplate = jdbcTemplate;
        this.cacheService = cacheService;
        this.redisKeys = redisKeys;
    }

    public Optional<RegisteredDevice> find(String deviceHashHex, byte[] deviceHash) {
        String cacheKey = redisKeys.device(deviceHashHex);
        Optional<DeviceCache> cached = cacheService.get(cacheKey, DeviceCache.class);
        if (cached.isPresent()) {
            return Optional.of(new RegisteredDevice(cached.get().id(), cached.get().status()));
        }

        List<RegisteredDevice> rows = jdbcTemplate.query(
                "SELECT id, status FROM device WHERE device_uid_hash = ?",
                (rs, rowNum) -> new RegisteredDevice(rs.getLong("id"), rs.getString("status")),
                deviceHash);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        RegisteredDevice device = rows.get(0);
        cacheService.put(cacheKey, new DeviceCache(device.id(), device.status()), DEVICE_CACHE_TTL);
        return Optional.of(device);
    }

    public void evict(String deviceHashHex) {
        cacheService.delete(redisKeys.device(deviceHashHex));
    }

    public record RegisteredDevice(long id, String status) {
    }

    public record DeviceCache(long id, String status) {
    }
}
