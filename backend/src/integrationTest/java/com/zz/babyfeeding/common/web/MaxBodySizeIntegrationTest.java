package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.RequestBuilder;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FIX-BE-03: the 1 MB body limit must hold for both Content-Length and
 * chunked (Transfer-Encoding) requests.
 */
class MaxBodySizeIntegrationTest extends IntegrationTestBase {

    private static final int LIMIT = 1024 * 1024;
    private static final MediaType JSON = MediaType.APPLICATION_JSON;

    @Test
    void knownContentLengthAboveLimitIsRejected() throws Exception {
        MvcResult result = postJson("/api/v1/devices/init", newDeviceId(),
                Map.of("platform", "H5", "padding", "x".repeat(LIMIT)));

        assertError(result, 413, "PAYLOAD_TOO_LARGE");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device", Integer.class)).isZero();
    }

    @Test
    void chunkedBodyAboveLimitIsRejected() throws Exception {
        byte[] body = ("{\"platform\":\"H5\",\"padding\":\""
                + "x".repeat(LIMIT) + "\"}").getBytes(StandardCharsets.UTF_8);
        assertThat(body.length).isGreaterThan(LIMIT);

        MvcResult result = mockMvc.perform(
                        chunkedPost("/api/v1/devices/init", newDeviceId(), body))
                .andReturn();

        assertError(result, 413, "PAYLOAD_TOO_LARGE");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM device", Integer.class)).isZero();
    }

    @Test
    void chunkedBodyWithinLimitIsReplayedAndAccepted() throws Exception {
        String deviceId = newDeviceId();
        byte[] body = ("{\"platform\":\"H5\",\"padding\":\""
                + "x".repeat(1000) + "\"}").getBytes(StandardCharsets.UTF_8);

        MvcResult result = mockMvc.perform(
                        chunkedPost("/api/v1/devices/init", deviceId, body))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(body(result).path("data").path("deviceId").asText()).isEqualTo(deviceId);
        assertThat(body(result).path("data").path("created").asBoolean()).isTrue();
    }

    /**
     * MockHttpServletRequest derives Content-Length from the buffered body, so
     * a plain chunked header would still look length-delimited. This request
     * reports -1 like a real Transfer-Encoding: chunked request.
     */
    private static RequestBuilder chunkedPost(String path, String deviceId, byte[] body) {
        return servletContext -> {
            MockHttpServletRequest request = new MockHttpServletRequest(servletContext) {
                @Override
                public int getContentLength() {
                    return -1;
                }

                @Override
                public long getContentLengthLong() {
                    return -1;
                }
            };
            request.setMethod("POST");
            request.setRequestURI(path);
            request.setServletPath(path);
            request.setContentType(JSON.toString());
            request.setCharacterEncoding(StandardCharsets.UTF_8.name());
            request.addHeader("Transfer-Encoding", "chunked");
            if (deviceId != null) {
                request.addHeader("X-Device-Id", deviceId);
            }
            request.setContent(body);
            return request;
        };
    }
}
