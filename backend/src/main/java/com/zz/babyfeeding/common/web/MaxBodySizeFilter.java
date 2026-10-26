package com.zz.babyfeeding.common.web;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.config.AppProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * Rejects JSON bodies above the 1 MB limit before they are parsed.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class MaxBodySizeFilter extends OncePerRequestFilter {

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
        long contentLength = request.getContentLengthLong();
        if (path.startsWith("/api/v1/")
                && contentLength > appProperties.getMaxRequestBodyBytes()) {
            response.setStatus(ErrorCode.PAYLOAD_TOO_LARGE.getStatus().value());
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            byte[] body = objectMapper.writeValueAsBytes(
                    ApiResponse.error(ErrorCode.PAYLOAD_TOO_LARGE, null));
            response.getOutputStream().write(body);
            response.flushBuffer();
            return;
        }
        filterChain.doFilter(request, response);
    }
}
