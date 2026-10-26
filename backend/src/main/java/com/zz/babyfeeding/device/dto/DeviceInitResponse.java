package com.zz.babyfeeding.device.dto;

import java.time.Instant;

public record DeviceInitResponse(
        String deviceId,
        boolean created,
        Instant firstSeenAt,
        String serverTime
) {
}
