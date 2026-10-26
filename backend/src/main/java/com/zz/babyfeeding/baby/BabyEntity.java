package com.zz.babyfeeding.baby;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("baby")
public class BabyEntity {

    @TableId(type = IdType.INPUT)
    private String id;
    private Long deviceId;
    private String name;
    private String gender;
    private LocalDate birthDate;
    private Boolean isDefault;
    private String familyId;
    private Integer revision;
    private LocalDateTime deletedAt;
    private Long createdByUserId;
    private Long updatedByUserId;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
