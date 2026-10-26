package com.zz.babyfeeding.common.api;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

class ErrorCodeTest {

    @Test
    void codesAreUnique() {
        Set<String> codes = Arrays.stream(ErrorCode.values())
                .map(ErrorCode::getCode)
                .collect(Collectors.toSet());

        assertThat(codes).hasSize(ErrorCode.values().length);
    }

    @Test
    void mapsContractCodesToHttpStatuses() {
        assertThat(ErrorCode.OK.getStatus()).isEqualTo(HttpStatus.OK);
        assertThat(ErrorCode.VALIDATION_ERROR.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ErrorCode.DEVICE_ID_REQUIRED.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ErrorCode.DEVICE_ID_INVALID.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(ErrorCode.DEVICE_NOT_REGISTERED.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.DEVICE_DISABLED.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ErrorCode.NOT_FOUND.getStatus()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(ErrorCode.CONFLICT.getStatus()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(ErrorCode.RATE_LIMITED.getStatus()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(ErrorCode.PAYLOAD_TOO_LARGE.getStatus())
                .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(ErrorCode.EXPORT_TOKEN_INVALID.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(ErrorCode.EXPORT_TOKEN_EXPIRED.getStatus()).isEqualTo(HttpStatus.GONE);
        assertThat(ErrorCode.EXPORT_TOO_LARGE.getStatus())
                .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(ErrorCode.INTERNAL_ERROR.getStatus())
                .isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(ErrorCode.SERVICE_UNAVAILABLE.getStatus())
                .isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void wireCodesMatchContractStrings() {
        assertThat(ErrorCode.VALIDATION_ERROR.getCode()).isEqualTo("VALIDATION_ERROR");
        assertThat(ErrorCode.DEVICE_NOT_REGISTERED.getCode()).isEqualTo("DEVICE_NOT_REGISTERED");
        assertThat(ErrorCode.EXPORT_TOKEN_EXPIRED.getCode()).isEqualTo("EXPORT_TOKEN_EXPIRED");
        assertThat(ErrorCode.BABY_LIMIT_EXCEEDED.getCode()).isEqualTo("BABY_LIMIT_EXCEEDED");
        assertThat(ErrorCode.DEFAULT_BABY_REQUIRED.getCode())
                .isEqualTo("DEFAULT_BABY_REQUIRED");
        assertThat(ErrorCode.OK.getCode()).isEqualTo("OK");
    }
}
