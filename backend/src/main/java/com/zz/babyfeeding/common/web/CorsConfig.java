package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.config.AppProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS whitelist for direct browser access during development/integration.
 * Credentials are disabled because the API has no cookies.
 */
@Configuration
public class CorsConfig implements WebMvcConfigurer {

    private final AppProperties appProperties;

    public CorsConfig(AppProperties appProperties) {
        this.appProperties = appProperties;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(appProperties.getCorsOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "X-Device-Id", "X-Request-Id", "X-Client-Version")
                .exposedHeaders("X-Request-Id", "X-RateLimit-Limit", "X-RateLimit-Remaining",
                        "Retry-After", "Content-Disposition")
                .allowCredentials(false)
                .maxAge(3600);
    }
}
