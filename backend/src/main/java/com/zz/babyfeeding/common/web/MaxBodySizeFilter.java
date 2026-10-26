package com.zz.babyfeeding.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * Rejects JSON bodies above the 1 MB limit before they are parsed.
 *
 * <p>Content-Length cannot be trusted on its own: a {@code Transfer-Encoding:
 * chunked} request reports -1 and would bypass the limit. Such requests are
 * read here with a hard cap and the bytes are replayed downstream through a
 * wrapper, so the cap holds regardless of how the client frames the body.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class MaxBodySizeFilter extends OncePerRequestFilter {

    private static final int READ_BUFFER_BYTES = 8192;

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;

    public MaxBodySizeFilter(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/v1/")) {
            filterChain.doFilter(request, response);
            return;
        }

        long maxBytes = appProperties.getMaxRequestBodyBytes();
        long contentLength = request.getContentLengthLong();
        // Known length: reject without reading the body.
        if (contentLength > maxBytes) {
            reject(response);
            return;
        }
        // No Content-Length (chunked): read with a hard cap, then replay.
        if (contentLength < 0) {
            byte[] body = readAtMost(request.getInputStream(), maxBytes);
            if (body == null) {
                reject(response);
                return;
            }
            filterChain.doFilter(new CachedBodyRequest(request, body), response);
            return;
        }
        filterChain.doFilter(request, response);
    }

    /** Returns the body, or {@code null} as soon as it exceeds {@code maxBytes}. */
    private static byte[] readAtMost(InputStream input, long maxBytes) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[READ_BUFFER_BYTES];
        int read;
        while ((read = input.read(buffer)) != -1) {
            body.write(buffer, 0, read);
            if (body.size() > maxBytes) {
                return null;
            }
        }
        return body.toByteArray();
    }

    private void reject(HttpServletResponse response) throws IOException {
        response.setStatus(ErrorCode.PAYLOAD_TOO_LARGE.getStatus().value());
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        byte[] body = objectMapper.writeValueAsBytes(
                ApiResponse.error(ErrorCode.PAYLOAD_TOO_LARGE, null));
        response.getOutputStream().write(body);
        response.flushBuffer();
    }

    /** Replays the already-read body with its real length. */
    private static final class CachedBodyRequest extends HttpServletRequestWrapper {

        private final byte[] body;

        CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return input.read();
                }

                @Override
                public int read(byte[] target, int offset, int length) {
                    return input.read(target, offset, length);
                }

                @Override
                public boolean isFinished() {
                    return input.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener listener) {
                    throw new UnsupportedOperationException("Async reads are not supported");
                }
            };
        }

        @Override
        public BufferedReader getReader() throws IOException {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null
                    ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }
    }
}
