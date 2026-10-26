package com.zz.babyfeeding.feeding;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("feeding_record")
public class FeedingRecordEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private Long deviceId;
    private String babyId;
    private String feedType;
    private String breastSide;
    private BigDecimal amountValue;
    private String amountUnit;
    private Integer durationSec;
    private String note;
    /** JSON array of FeedingTag codes, kept in enum order. */
    private String tags;
    private LocalDateTime startedAt;
    private LocalDateTime endedAt;
    private Integer tzOffsetMinutes;
    private LocalDate recordDate;
    private LocalDateTime clientUpdatedAt;
    private Integer revision;
    private LocalDateTime deletedAt;
    private Long createdByUserId;
    private Long updatedByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
