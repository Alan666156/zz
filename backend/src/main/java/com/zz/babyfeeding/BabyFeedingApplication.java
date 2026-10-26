package com.zz.babyfeeding;

import com.zz.babyfeeding.config.AppProperties;
import org.mybatis.spring.annotation.MapperScan;
import org.apache.ibatis.annotations.Mapper;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(AppProperties.class)
@MapperScan(basePackages = "com.zz.babyfeeding", annotationClass = Mapper.class)
public class BabyFeedingApplication {

    public static void main(String[] args) {
        SpringApplication.run(BabyFeedingApplication.class, args);
    }
}
