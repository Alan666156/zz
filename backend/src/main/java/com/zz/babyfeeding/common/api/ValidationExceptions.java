package com.zz.babyfeeding.common.api;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds contract-shaped VALIDATION_ERROR failures for checks that cannot be
 * expressed with Bean Validation (Unicode character counts, cross-field rules).
 */
public final class ValidationExceptions {

    private ValidationExceptions() {
    }

    public static BusinessException field(String field, String message) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("field", field);
        item.put("message", message);
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("fieldErrors", List.of(item));
        return new BusinessException(ErrorCode.VALIDATION_ERROR,
                ErrorCode.VALIDATION_ERROR.getMessage(), data);
    }
}
