package com.zz.babyfeeding.sync;

import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.util.UuidUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

/**
 * Per-device 15 s sync lock using Redis 5 compatible SET NX PX and a
 * compare-and-delete release. Redis failures are fail-open: the batch proceeds
 * without a lock and per-item revision checks prevent duplicate writes.
 */
@Service
public class SyncLockService {

    private static final Logger log = LoggerFactory.getLogger(SyncLockService.class);
    private static final Duration LOCK_TTL = Duration.ofSeconds(15);

    private static final DefaultRedisScript<Long> COMPARE_AND_DELETE =
            new DefaultRedisScript<>("""
                    if redis.call('GET', KEYS[1]) == ARGV[1] then
                      return redis.call('DEL', KEYS[1])
                    end
                    return 0
                    """, Long.class);

    private final StringRedisTemplate redis;
    private final RedisKeys redisKeys;

    public SyncLockService(StringRedisTemplate redis, RedisKeys redisKeys) {
        this.redis = redis;
        this.redisKeys = redisKeys;
    }

    public Attempt acquire(String deviceHashHex) {
        String token = UuidUtils.newUuidV4();
        try {
            Boolean acquired = redis.opsForValue().setIfAbsent(
                    redisKeys.syncLock(deviceHashHex), token, LOCK_TTL);
            return new Attempt(Boolean.TRUE.equals(acquired), true, token);
        } catch (Exception ex) {
            log.warn("sync lock unavailable (fail-open) deviceHash={} cause={}",
                    safePrefix(deviceHashHex), ex.getClass().getSimpleName());
            return new Attempt(false, false, null);
        }
    }

    public void release(String deviceHashHex, Attempt attempt) {
        if (attempt == null || !attempt.acquired() || attempt.token() == null) {
            return;
        }
        try {
            redis.execute(COMPARE_AND_DELETE,
                    List.of(redisKeys.syncLock(deviceHashHex)), attempt.token());
        } catch (Exception ex) {
            log.warn("sync lock release failed deviceHash={} cause={}",
                    safePrefix(deviceHashHex), ex.getClass().getSimpleName());
        }
    }

    private static String safePrefix(String deviceHashHex) {
        return deviceHashHex == null || deviceHashHex.length() < 8
                ? "unknown" : deviceHashHex.substring(0, 8);
    }

    /**
     * acquired=true means this request owns the lock; redisAvailable=false
     * means Redis failed and the caller must proceed without the lock;
     * otherwise another batch holds the lock.
     */
    public record Attempt(boolean acquired, boolean redisAvailable, String token) {

        public boolean blocked() {
            return redisAvailable && !acquired;
        }
    }
}
