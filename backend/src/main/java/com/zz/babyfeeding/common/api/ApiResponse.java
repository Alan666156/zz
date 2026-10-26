package com.zz.babyfeeding.common.api;

import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import org.slf4j.MDC;

/**
 * Uniform response envelope: {code, message, data, requestId, serverTime}.
 */
public record ApiResponse<T>(
        String code,
        String message,
        T data,
        String requestId,
        String serverTime
) {

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(
                ErrorCode.OK.getCode(),
                ErrorCode.OK.getMessage(),
                data,
                currentRequestId(),
                TimeUtils.serverTime());
    }

    public static <T> ApiResponse<T> error(ErrorCode errorCode, T data) {
        return error(errorCode, errorCode.getMessage(), data);
    }

    public static <T> ApiResponse<T> error(ErrorCode errorCode, String message, T data) {
        return new ApiResponse<>(
                errorCode.getCode(),
                message == null ? errorCode.getMessage() : message,
                data,
                currentRequestId(),
                TimeUtils.serverTime());
    }

    private static String currentRequestId() {
        String requestId = MDC.get("requestId");
        return requestId == null || requestId.isBlank() ? UuidUtils.newUuidV4() : requestId;
    }
}
