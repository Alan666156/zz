package com.zz.babyfeeding.device;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("device")
public class DeviceEntity {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** HMAC-SHA256(APP_DEVICE_PEPPER, deviceId); the raw id is never stored. */
    private byte[] deviceUidHash;
    private Long userId;
    private String platform;
    private String appVersion;
    private String status;
    private LocalDateTime firstSeenAt;
    private LocalDateTime lastSeenAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
