package com.zz.babyfeeding.common.api;

/**
 * Expected business failure. The global handler maps it to the contract error
 * envelope; stack traces are never returned to clients.
 */
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;
    private final transient Object data;
    private Long retryAfterSeconds;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.data = null;
    }

    public BusinessException(ErrorCode errorCode, String message) {
        super(message);
        this.errorCode = errorCode;
        this.data = null;
    }

    public BusinessException(ErrorCode errorCode, Object data) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
        this.data = data;
    }

    public BusinessException(ErrorCode errorCode, String message, Object data) {
        super(message);
        this.errorCode = errorCode;
        this.data = data;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }

    public Object getData() {
        return data;
    }

    public Long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }

    public BusinessException withRetryAfterSeconds(long seconds) {
        this.retryAfterSeconds = seconds;
        return this;
    }
}
