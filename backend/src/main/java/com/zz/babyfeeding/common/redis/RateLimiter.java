package com.zz.babyfeeding.common.redis;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * Fixed-window rate limiter using a Redis 5 compatible EVAL script
 * (INCR + EXPIRE). Redis failures are fail-open. Keys contain device hashes,
 * never raw device ids.
 */
@Service
public class RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RateLimiter.class);

    private static final DefaultRedisScript<Long> INCR_WITH_EXPIRE = new DefaultRedisScript<>("""
            local current = redis.call('INCR', KEYS[1])
            if current == 1 then
              redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return current
            """, Long.class);

    /**
     * Q-20: reserve a slot only while the success counter is below the limit.
     * Returns -1 when the window is full, otherwise the new count. GET and
     * INCR run in one script so concurrent requests cannot overshoot.
     */
    private static final DefaultRedisScript<Long> RESERVE_IF_BELOW = new DefaultRedisScript<>("""
            local current = tonumber(redis.call('GET', KEYS[1]) or '0')
            local limit = tonumber(ARGV[1])
            if current >= limit then
              return -1
            end
            local updated = redis.call('INCR', KEYS[1])
            if updated == 1 then
              redis.call('EXPIRE', KEYS[1], ARGV[2])
            end
            return updated
            """, Long.class);

    /** Rolls a reservation back without ever dropping below zero. */
    private static final DefaultRedisScript<Long> RELEASE = new DefaultRedisScript<>("""
            local current = tonumber(redis.call('GET', KEYS[1]) or '0')
            if current <= 0 then
              return 0
            end
            return redis.call('DECR', KEYS[1])
            """, Long.class);

    private final StringRedisTemplate redis;
    private final RedisKeys redisKeys;

    public RateLimiter(StringRedisTemplate redis, RedisKeys redisKeys) {
        this.redis = redis;
        this.redisKeys = redisKeys;
    }

    public RateLimitResult acquire(String scope, String subject, int limit, Duration window) {
        long windowSeconds = Math.max(1L, window.toSeconds());
        long nowSecond = Instant.now().getEpochSecond();
        long windowStart = (nowSecond / windowSeconds) * windowSeconds;
        String key = redisKeys.rateLimit(scope, subject, windowStart);
        try {
            Long count = redis.execute(INCR_WITH_EXPIRE, List.of(key),
                    String.valueOf(windowSeconds));
            long used = count == null ? 0L : count;
            long remaining = Math.max(0L, limit - used);
            if (used > limit) {
                long retryAfter = Math.max(1L, windowStart + windowSeconds - nowSecond);
                return new RateLimitResult(false, limit, 0L, retryAfter);
            }
            return new RateLimitResult(true, limit, remaining, 0L);
        } catch (Exception ex) {
            log.warn("rate limiter unavailable (fail-open) scope={} cause={}",
                    scope, ex.getClass().getSimpleName());
            return new RateLimitResult(true, limit, -1L, 0L);
        }
    }

    /**
     * Atomically claims a slot if fewer than {@code limit} slots are used in the
     * current window. The returned key is the reservation handle to pass to
     * {@link #release(String, int)}; it is {@code null} when Redis failed open
     * (nothing was reserved, nothing must be rolled back).
     */
    public Reservation reserve(String scope, String subject, int limit, Duration window) {
        long windowSeconds = Math.max(1L, window.toSeconds());
        long nowSecond = Instant.now().getEpochSecond();
        long windowStart = (nowSecond / windowSeconds) * windowSeconds;
        String key = redisKeys.rateLimit(scope, subject, windowStart);
        try {
            Long updated = redis.execute(RESERVE_IF_BELOW, List.of(key),
                    String.valueOf(limit), String.valueOf(windowSeconds));
            long used = updated == null ? 0L : updated;
            if (used < 0) {
                long retryAfter = Math.max(1L, windowStart + windowSeconds - nowSecond);
                return new Reservation(false, limit, 0L, retryAfter, null);
            }
            return new Reservation(true, limit, Math.max(0L, limit - used), 0L, key);
        } catch (Exception ex) {
            log.warn("rate limiter unavailable (fail-open) scope={} cause={}",
                    scope, ex.getClass().getSimpleName());
            return new Reservation(true, limit, -1L, 0L, null);
        }
    }

    /**
     * Rolls back one reservation and returns the remaining quota, or -1 when
     * Redis failed (the caller then leaves the headers untouched, Q-18).
     */
    public long release(String key, int limit) {
        try {
            Long count = redis.execute(RELEASE, List.of(key));
            long used = count == null ? 0L : count;
            return Math.max(0L, limit - used);
        } catch (Exception ex) {
            log.warn("rate limiter unavailable (fail-open) cause={}",
                    ex.getClass().getSimpleName());
            return -1L;
        }
    }

    public record RateLimitResult(boolean allowed, long limit, long remaining,
                                  long retryAfterSeconds) {
    }

    public record Reservation(boolean allowed, long limit, long remaining,
                              long retryAfterSeconds, String key) {
    }
}
