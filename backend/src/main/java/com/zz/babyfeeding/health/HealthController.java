package com.zz.babyfeeding.health;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.config.AppProperties;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Self-written health endpoint. Actuator is intentionally not exposed.
 * No device header required; missing dependencies return HTTP 503.
 */
@RestController
@RequestMapping("/api/v1/health")
public class HealthController {

    private final JdbcTemplate jdbcTemplate;
    private final RedisConnectionFactory redisConnectionFactory;
    private final AppProperties appProperties;

    public HealthController(JdbcTemplate jdbcTemplate,
                            RedisConnectionFactory redisConnectionFactory,
                            AppProperties appProperties) {
        this.jdbcTemplate = jdbcTemplate;
        this.redisConnectionFactory = redisConnectionFactory;
        this.appProperties = appProperties;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Object>> health() {
        Map<String, Object> checks = new LinkedHashMap<>();
        checks.put("db", checkDb());
        checks.put("redis", checkRedis());

        boolean up = isUp(checks);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", up ? "UP" : "DOWN");
        data.put("checks", checks);
        data.put("version", appProperties.getVersion());
        data.put("serverTime", TimeUtils.serverTime());

        ApiResponse<Object> body = up
                ? ApiResponse.ok(data)
                : ApiResponse.error(ErrorCode.SERVICE_UNAVAILABLE, data);
        return ResponseEntity.status(up ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }

    private Map<String, Object> checkDb() {
        long start = System.nanoTime();
        try {
            Integer value = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
            if (value == null || value != 1) {
                throw new IllegalStateException("unexpected SELECT 1 result");
            }
            return upCheck(start);
        } catch (Exception ex) {
            return downCheck(start, ex.getClass().getSimpleName());
        }
    }

    private Map<String, Object> checkRedis() {
        long start = System.nanoTime();
        try (RedisConnection connection = redisConnectionFactory.getConnection()) {
            String pong = connection.ping();
            if (!"PONG".equalsIgnoreCase(pong)) {
                throw new IllegalStateException("unexpected PING result");
            }
            return upCheck(start);
        } catch (Exception ex) {
            return downCheck(start, ex.getClass().getSimpleName());
        }
    }

    private static Map<String, Object> upCheck(long startNanos) {
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("status", "UP");
        check.put("latencyMs", elapsedMs(startNanos));
        return check;
    }

    private static Map<String, Object> downCheck(long startNanos, String error) {
        Map<String, Object> check = new LinkedHashMap<>();
        check.put("status", "DOWN");
        check.put("latencyMs", elapsedMs(startNanos));
        // Only the exception type is exposed; never connection strings or credentials.
        check.put("error", error);
        return check;
    }

    private static long elapsedMs(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000L;
    }

    private static boolean isUp(Map<String, Object> checks) {
        return checks.values().stream()
                .allMatch(check -> "UP".equals(((Map<?, ?>) check).get("status")));
    }
}
