package com.zz.babyfeeding.support;

import org.springframework.beans.factory.InitializingBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Refuses to run integration tests against anything but the dedicated test
 * database and Redis DB 15.
 */
@Component
@Profile("test")
public class TestEnvironmentGuard implements InitializingBean {

    private final String datasourceUrl;
    private final int redisDatabase;
    private final String redisKeyPrefix;

    public TestEnvironmentGuard(
            @Value("${spring.datasource.url}") String datasourceUrl,
            @Value("${spring.data.redis.database}") int redisDatabase,
            @Value("${app.redis-key-prefix}") String redisKeyPrefix) {
        this.datasourceUrl = datasourceUrl;
        this.redisDatabase = redisDatabase;
        this.redisKeyPrefix = redisKeyPrefix;
    }

    @Override
    public void afterPropertiesSet() {
        if (datasourceUrl == null || !datasourceUrl.contains("/zz_test")) {
            throw new IllegalStateException(
                    "Integration tests must use the zz_test database; got: " + datasourceUrl);
        }
        if (redisDatabase != 15) {
            throw new IllegalStateException(
                    "Integration tests must use Redis database 15; got: " + redisDatabase);
        }
        if (redisKeyPrefix == null || !redisKeyPrefix.startsWith("test:")) {
            throw new IllegalStateException(
                    "Integration tests must use a test: Redis key prefix; got: " + redisKeyPrefix);
        }
    }
}
