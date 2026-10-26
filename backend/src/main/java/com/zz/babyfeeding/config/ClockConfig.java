package com.zz.babyfeeding.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    /** Injectable clock so token expiry tests can control time. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
