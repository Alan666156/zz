package com.zz.babyfeeding.device.dto;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DeviceInitRequest(
        @Pattern(regexp = "^H5$", message = "platform 仅支持 H5") String platform,
        @Size(max = 32, message = "appVersion 最长 32 字符") String appVersion
) {
}
