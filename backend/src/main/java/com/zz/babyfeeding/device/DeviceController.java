package com.zz.babyfeeding.device;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.device.dto.DeviceInitRequest;
import com.zz.babyfeeding.device.dto.DeviceInitResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/devices")
public class DeviceController {

    private final DeviceService deviceService;

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
    }

    @PostMapping("/init")
    public ApiResponse<DeviceInitResponse> init(
            @RequestHeader(value = "X-Device-Id", required = false) String deviceIdHeader,
            @Valid @RequestBody DeviceInitRequest request) {

        String deviceId = requireDeviceId(deviceIdHeader);
        DeviceService.InitResult result =
                deviceService.init(deviceId, request.platform(), request.appVersion());

        return ApiResponse.ok(new DeviceInitResponse(
                deviceId, result.created(), result.firstSeenAt(), TimeUtils.serverTime()));
    }

    private static String requireDeviceId(String header) {
        if (header == null || header.isBlank()) {
            throw new BusinessException(ErrorCode.DEVICE_ID_REQUIRED);
        }
        String trimmed = header.trim();
        if (!UuidUtils.isUuidV4(trimmed)) {
            throw new BusinessException(ErrorCode.DEVICE_ID_INVALID);
        }
        return UuidUtils.normalize(trimmed);
    }
}
