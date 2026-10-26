package com.zz.babyfeeding.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Application configuration. Secrets have no defaults in application.yml and are
 * validated here so the application refuses to start with missing/weak values.
 */
@Getter
@Setter
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    /** HMAC-SHA256 pepper for device ids. Read from APP_DEVICE_PEPPER only. */
    private String devicePepper;

    /** HMAC-SHA256 key for CSV export tokens. Read from APP_EXPORT_TOKEN_KEY only. */
    private String exportTokenKey;

    private List<String> corsOrigins = new ArrayList<>(List.of(
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173"
    ));

    private String version = "1.0.0";

    /** Redis key namespace. Tests override it with a test-only prefix. */
    private String redisKeyPrefix = "zz:bf:v1:";

    private long exportTokenTtlSeconds = 300;

    private long maxRequestBodyBytes = 1024L * 1024L;

    @PostConstruct
    void validate() {
        requireSecret("APP_DEVICE_PEPPER (app.device-pepper)", devicePepper);
        requireSecret("APP_EXPORT_TOKEN_KEY (app.export-token-key)", exportTokenKey);
        if (devicePepper.equals(exportTokenKey)) {
            throw new IllegalStateException(
                    "APP_DEVICE_PEPPER and APP_EXPORT_TOKEN_KEY must be different keys");
        }
        if (exportTokenTtlSeconds <= 0) {
            throw new IllegalStateException("app.export-token-ttl-seconds must be positive");
        }
    }

    private static void requireSecret(String name, String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required and must be provided via environment");
        }
        if (value.length() < 16) {
            throw new IllegalStateException(name + " must be at least 16 characters");
        }
    }
}
