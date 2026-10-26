package com.zz.babyfeeding.common.api;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

import static org.assertj.core.api.Assertions.assertThat;

class ApiResponseTest {

    @AfterEach
    void clearMdc() {
        MDC.clear();
    }

    @Test
    void successEnvelopeUsesOkAndRequestIdFromMdc() {
        String requestId = "4f1c2f7e-9d1a-4b7c-9c2e-3f6a1b2c3d4e";
        MDC.put("requestId", requestId);

        ApiResponse<String> response = ApiResponse.ok("data");

        assertThat(response.code()).isEqualTo("OK");
        assertThat(response.message()).isEqualTo("success");
        assertThat(response.data()).isEqualTo("data");
        assertThat(response.requestId()).isEqualTo(requestId);
        assertThat(response.serverTime())
                .matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
    }

    @Test
    void errorEnvelopeCarriesCodeMessageAndData() {
        ApiResponse<Object> response =
                ApiResponse.error(ErrorCode.VALIDATION_ERROR, "bad input", null);

        assertThat(response.code()).isEqualTo("VALIDATION_ERROR");
        assertThat(response.message()).isEqualTo("bad input");
        assertThat(response.data()).isNull();
        assertThat(response.requestId()).isNotBlank();
    }

    @Test
    void generatesRequestIdWhenMissing() {
        MDC.clear();

        assertThat(ApiResponse.ok(null).requestId()).isNotBlank();
    }
}
