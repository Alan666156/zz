package com.zz.babyfeeding.growth;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("growth_record")
public class GrowthRecordEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private Long deviceId;
    private String babyId;
    private LocalDate measuredOn;
    private BigDecimal heightCm;
    private BigDecimal weightKg;
    private BigDecimal headCircumferenceCm;
    private String note;
    private Integer revision;
    private LocalDateTime deletedAt;
    private Long createdByUserId;
    private Long updatedByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
