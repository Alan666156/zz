package com.zz.babyfeeding.common.redis;

import com.zz.babyfeeding.config.AppProperties;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * Central Redis key builder. Device scoping uses the device hash, never the raw
 * device id, so the anonymous identifier is not persisted in Redis either.
 */
@Component
public class RedisKeys {

    private final String prefix;

    public RedisKeys(AppProperties appProperties) {
        this.prefix = appProperties.getRedisKeyPrefix();
        if (!prefix.endsWith(":")) {
            throw new IllegalStateException("app.redis-key-prefix must end with ':'");
        }
    }

    public String device(String deviceHashHex) {
        return prefix + "dev:" + deviceHashHex;
    }

    public String baby(String deviceHashHex, String babyId) {
        return prefix + "baby:" + deviceHashHex + ":" + babyId;
    }

    public String statsVersion(String deviceHashHex, String babyId) {
        return prefix + "statsver:feed:" + deviceHashHex + ":" + babyId;
    }

    public String statsDaily(String deviceHashHex, String babyId, long version, LocalDate date) {
        return prefix + "stats:feed:" + deviceHashHex + ":" + babyId + ":" + version
                + ":daily:" + date;
    }

    public String statsTrend(String deviceHashHex, String babyId, long version,
                             LocalDate from, LocalDate to) {
        return prefix + "stats:feed:" + deviceHashHex + ":" + babyId + ":" + version
                + ":trend:" + from + ":" + to;
    }

    public String rateLimit(String scope, String subject, long windowStartEpochSecond) {
        return prefix + "rl:" + scope + ":" + subject + ":" + windowStartEpochSecond;
    }

    public String syncLock(String deviceHashHex) {
        return prefix + "lock:sync:" + deviceHashHex;
    }

    public String syncBatch(String deviceHashHex, String batchId) {
        return prefix + "sync:" + deviceHashHex + ":" + batchId;
    }
}
