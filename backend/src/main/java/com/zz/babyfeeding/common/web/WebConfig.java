package com.zz.babyfeeding.common.web;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final DeviceContextInterceptor deviceContextInterceptor;
    private final RateLimitInterceptor rateLimitInterceptor;

    public WebConfig(DeviceContextInterceptor deviceContextInterceptor,
                     RateLimitInterceptor rateLimitInterceptor) {
        this.deviceContextInterceptor = deviceContextInterceptor;
        this.rateLimitInterceptor = rateLimitInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(deviceContextInterceptor)
                .addPathPatterns("/api/v1/**")
                .order(0);
        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/v1/**")
                .order(1);
    }
}
