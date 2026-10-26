package com.zz.babyfeeding.common.api;

import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.BindException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Converts exceptions into the uniform error envelope. No stack traces or
 * exception internals are exposed to clients; 5xx details go to the log only.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Object>> handleBusiness(
            BusinessException ex, HttpServletRequest request) {
        ErrorCode code = ex.getErrorCode();
        if (code.getStatus().is5xxServerError()) {
            log.error("business error code={} path={}", code.getCode(), request.getRequestURI(), ex);
        } else {
            log.warn("business error code={} path={} message={}",
                    code.getCode(), request.getRequestURI(), ex.getMessage());
        }
        HttpHeaders headers = new HttpHeaders();
        if (ex.getRetryAfterSeconds() != null) {
            headers.set(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()));
        }
        return build(code, ex.getMessage(), ex.getData(), headers);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Object>> handleValidation(
            MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<FieldErrorItem> errors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.add(new FieldErrorItem(fieldError.getField(), fieldError.getDefaultMessage()));
        }
        return validationResponse(errors, request);
    }

    @ExceptionHandler(BindException.class)
    public ResponseEntity<ApiResponse<Object>> handleBind(
            BindException ex, HttpServletRequest request) {
        List<FieldErrorItem> errors = new ArrayList<>();
        for (FieldError fieldError : ex.getBindingResult().getFieldErrors()) {
            errors.add(new FieldErrorItem(fieldError.getField(), fieldError.getDefaultMessage()));
        }
        return validationResponse(errors, request);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleConstraint(
            ConstraintViolationException ex, HttpServletRequest request) {
        List<FieldErrorItem> errors = new ArrayList<>();
        ex.getConstraintViolations().forEach(violation ->
                errors.add(new FieldErrorItem(
                        violation.getPropertyPath().toString(), violation.getMessage())));
        return validationResponse(errors, request);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethodValidation(
            HandlerMethodValidationException ex, HttpServletRequest request) {
        List<FieldErrorItem> errors = new ArrayList<>();
        ex.getAllValidationResults().forEach(result -> {
            String parameterName = result.getMethodParameter().getParameterName();
            result.getResolvableErrors().forEach(error ->
                    errors.add(new FieldErrorItem(parameterName, error.getDefaultMessage())));
        });
        return validationResponse(errors, request);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Object>> handleUnreadable(
            HttpMessageNotReadableException ex, HttpServletRequest request) {
        FieldErrorItem typeMismatch = scalarTypeMismatch(ex.getCause());
        if (typeMismatch != null) {
            return validationResponse(List.of(typeMismatch), request);
        }
        log.warn("unreadable request body path={}", request.getRequestURI());
        return build(ErrorCode.BAD_REQUEST, "请求体格式错误或 JSON 无法解析", null, new HttpHeaders());
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Object>> handleMissingHeader(
            MissingRequestHeaderException ex, HttpServletRequest request) {
        ErrorCode code = "X-Device-Id".equalsIgnoreCase(ex.getHeaderName())
                ? ErrorCode.DEVICE_ID_REQUIRED : ErrorCode.BAD_REQUEST;
        return build(code, "缺少请求头: " + ex.getHeaderName(), null, new HttpHeaders());
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<ApiResponse<Object>> handleMissingParameter(
            MissingServletRequestParameterException ex, HttpServletRequest request) {
        return build(ErrorCode.BAD_REQUEST, "缺少必填参数: " + ex.getParameterName(),
                null, new HttpHeaders());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Object>> handleTypeMismatch(
            MethodArgumentTypeMismatchException ex, HttpServletRequest request) {
        return build(ErrorCode.BAD_REQUEST, "参数类型错误: " + ex.getName(),
                null, new HttpHeaders());
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMediaType(
            HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return build(ErrorCode.UNSUPPORTED_MEDIA_TYPE, null, null, new HttpHeaders());
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiResponse<Object>> handleMethod(
            HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        if (ex.getSupportedHttpMethods() != null) {
            headers.set(HttpHeaders.ALLOW, ex.getSupportedHttpMethods().toString());
        }
        return build(ErrorCode.METHOD_NOT_ALLOWED, null, null, headers);
    }

    @ExceptionHandler({NoHandlerFoundException.class, NoResourceFoundException.class})
    public ResponseEntity<ApiResponse<Object>> handleNoHandler(
            Exception ex, HttpServletRequest request) {
        return build(ErrorCode.NOT_FOUND, null, null, new HttpHeaders());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<ApiResponse<Object>> handleTooLarge(
            MaxUploadSizeExceededException ex, HttpServletRequest request) {
        return build(ErrorCode.PAYLOAD_TOO_LARGE, null, null, new HttpHeaders());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResponse<Object>> handleIntegrity(
            DataIntegrityViolationException ex, HttpServletRequest request) {
        log.warn("data integrity violation path={}", request.getRequestURI());
        return build(ErrorCode.CONFLICT, "数据冲突，请重试", null, new HttpHeaders());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Object>> handleUnexpected(
            Exception ex, HttpServletRequest request) {
        log.error("unexpected error path={} requestId={}",
                request.getRequestURI(), org.slf4j.MDC.get("requestId"), ex);
        return build(ErrorCode.INTERNAL_ERROR, null, null, new HttpHeaders());
    }

    /**
     * Strict scalar typing (Q-13) turns a value of the wrong JSON type, e.g.
     * {@code "1"} for an Integer, into a Jackson mismatch. The contract treats
     * that as a field validation error. Date/time targets are excluded on
     * purpose: an unparseable date string is a body format error (Q-19), and a
     * mismatch without a field path is a malformed body, not a field error.
     */
    private static FieldErrorItem scalarTypeMismatch(Throwable cause) {
        for (Throwable current = cause; current != null; current = current.getCause()) {
            if (current instanceof MismatchedInputException mismatch) {
                String field = fieldPath(mismatch.getPath());
                Class<?> target = mismatch.getTargetType();
                if (field == null || target == null
                        || TemporalAccessor.class.isAssignableFrom(target)) {
                    return null;
                }
                return new FieldErrorItem(field, "字段类型不正确");
            }
        }
        return null;
    }

    private static String fieldPath(List<JsonMappingException.Reference> path) {
        StringBuilder field = new StringBuilder();
        for (JsonMappingException.Reference reference : path) {
            if (reference.getFieldName() == null) {
                continue;
            }
            if (!field.isEmpty()) {
                field.append('.');
            }
            field.append(reference.getFieldName());
        }
        return field.isEmpty() ? null : field.toString();
    }

    private static ResponseEntity<ApiResponse<Object>> validationResponse(
            List<FieldErrorItem> errors, HttpServletRequest request) {
        log.warn("validation failed path={} fields={}", request.getRequestURI(),
                errors.stream().map(FieldErrorItem::field).toList());
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("fieldErrors", errors);
        return build(ErrorCode.VALIDATION_ERROR, null, data, new HttpHeaders());
    }

    private static ResponseEntity<ApiResponse<Object>> build(
            ErrorCode code, String message, Object data, HttpHeaders headers) {
        HttpStatus status = code.getStatus();
        ApiResponse<Object> body = ApiResponse.error(code, message, data);
        return new ResponseEntity<>(body, headers, status);
    }

    public record FieldErrorItem(String field, String message) {
    }
}
