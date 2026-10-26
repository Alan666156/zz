package com.zz.babyfeeding.common.api;

import org.springframework.http.HttpStatus;

/**
 * Error codes from the API contract (section 4.2). The enum constant name is
 * independent from the wire code so that code strings remain stable.
 */
public enum ErrorCode {

    OK(HttpStatus.OK, "OK", "success"),

    VALIDATION_ERROR(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请求参数校验失败"),
    BAD_REQUEST(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "请求格式错误"),
    DEVICE_ID_REQUIRED(HttpStatus.BAD_REQUEST, "DEVICE_ID_REQUIRED", "缺少 X-Device-Id 请求头"),
    DEVICE_ID_INVALID(HttpStatus.BAD_REQUEST, "DEVICE_ID_INVALID", "X-Device-Id 必须是 UUID v4"),
    DEVICE_NOT_REGISTERED(HttpStatus.CONFLICT, "DEVICE_NOT_REGISTERED", "设备未初始化"),
    DEVICE_DISABLED(HttpStatus.FORBIDDEN, "DEVICE_DISABLED", "设备已被禁用"),
    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND", "资源不存在"),
    CONFLICT(HttpStatus.CONFLICT, "CONFLICT", "数据版本冲突"),
    SYNC_IN_PROGRESS(HttpStatus.CONFLICT, "SYNC_IN_PROGRESS", "同步批次正在处理"),
    RATE_LIMITED(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", "请求过于频繁"),
    PAYLOAD_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", "请求体超过限制"),
    UNSUPPORTED_MEDIA_TYPE(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_MEDIA_TYPE", "不支持的 Content-Type"),
    EXPORT_TOO_LARGE(HttpStatus.PAYLOAD_TOO_LARGE, "EXPORT_TOO_LARGE", "导出数据量超过限制"),
    EXPORT_TOKEN_INVALID(HttpStatus.FORBIDDEN, "EXPORT_TOKEN_INVALID", "导出链接无效"),
    EXPORT_TOKEN_EXPIRED(HttpStatus.GONE, "EXPORT_TOKEN_EXPIRED", "导出链接已过期"),
    BABY_LIMIT_EXCEEDED(HttpStatus.BAD_REQUEST, "BABY_LIMIT_EXCEEDED", "最多只能创建 5 个宝宝"),
    DEFAULT_BABY_REQUIRED(HttpStatus.BAD_REQUEST, "DEFAULT_BABY_REQUIRED", "不能取消当前默认宝宝"),
    INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "服务内部错误"),
    SERVICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE", "服务依赖不可用"),
    METHOD_NOT_ALLOWED(HttpStatus.METHOD_NOT_ALLOWED, "METHOD_NOT_ALLOWED", "请求方法不支持");

    private final HttpStatus status;
    private final String code;
    private final String message;

    ErrorCode(HttpStatus status, String code, String message) {
        this.status = status;
        this.code = code;
        this.message = message;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }
}
