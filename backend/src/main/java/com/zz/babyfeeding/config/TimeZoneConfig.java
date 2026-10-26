package com.zz.babyfeeding.config;

import jakarta.annotation.PostConstruct;
import org.springframework.context.annotation.Configuration;

import java.util.TimeZone;

/**
 * The architecture requires the JVM default time zone to be UTC. Database
 * timestamps are UTC and the API adds the client offset explicitly.
 */
@Configuration
public class TimeZoneConfig {

    @PostConstruct
    public void useUtc() {
        TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
    }
}
