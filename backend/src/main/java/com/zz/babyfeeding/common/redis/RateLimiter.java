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

    public record RateLimitResult(boolean allowed, long limit, long remaining,
                                  long retryAfterSeconds) {
    }
}
