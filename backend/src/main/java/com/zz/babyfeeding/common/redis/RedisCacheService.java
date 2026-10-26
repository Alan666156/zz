package com.zz.babyfeeding.common.redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Optional;

/**
 * Small JSON cache on Redis with fail-open semantics: a Redis outage degrades
 * to database reads instead of failing business requests. Values are never
 * logged.
 */
@Service
public class RedisCacheService {

    private static final Logger log = LoggerFactory.getLogger(RedisCacheService.class);

    private final StringRedisTemplate redis;
    private final ObjectMapper objectMapper;

    public RedisCacheService(StringRedisTemplate redis, ObjectMapper objectMapper) {
        this.redis = redis;
        this.objectMapper = objectMapper;
    }

    public <T> Optional<T> get(String key, Class<T> type) {
        try {
            String json = redis.opsForValue().get(key);
            if (json == null) {
                return Optional.empty();
            }
            return Optional.of(objectMapper.readValue(json, type));
        } catch (Exception ex) {
            log.warn("redis cache read failed (fail-open) key={} cause={}",
                    key, ex.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    public void put(String key, Object value, Duration ttl) {
        try {
            redis.opsForValue().set(key, objectMapper.writeValueAsString(value), ttl);
        } catch (Exception ex) {
            log.warn("redis cache write failed (fail-open) key={} cause={}",
                    key, ex.getClass().getSimpleName());
        }
    }

    public void delete(String key) {
        try {
            redis.delete(key);
        } catch (Exception ex) {
            log.warn("redis cache delete failed (fail-open) key={} cause={}",
                    key, ex.getClass().getSimpleName());
        }
    }

    /**
     * Increments a counter and re-applies its TTL on every call, as required by
     * the stats version contract (contract 2.4: 7 d, reset after each INCR).
     * Returns 0 when Redis is unavailable so callers can fall back to uncached
     * behaviour.
     */
    public long increment(String key, Duration ttl) {
        try {
            Long value = redis.opsForValue().increment(key);
            if (value != null) {
                redis.expire(key, ttl);
            }
            return value == null ? 0L : value;
        } catch (Exception ex) {
            log.warn("redis increment failed (fail-open) key={} cause={}",
                    key, ex.getClass().getSimpleName());
            return 0L;
        }
    }

    /**
     * Reads a plain numeric counter (the stats version). Missing keys and Redis
     * failures both yield 0, which keeps cache keys valid and fail-open.
     */
    public long currentVersion(String key) {
        try {
            String raw = redis.opsForValue().get(key);
            return raw == null ? 0L : Long.parseLong(raw);
        } catch (Exception ex) {
            log.warn("redis version read failed (fail-open) key={} cause={}",
                    key, ex.getClass().getSimpleName());
            return 0L;
        }
    }
}
