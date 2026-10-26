package com.zz.babyfeeding.common.web;

import com.zz.babyfeeding.common.util.UuidUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Assigns/propagates X-Request-Id, exposes it to logs and response bodies, and
 * adds the baseline response headers required by the contract.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String REQUEST_ID_ATTRIBUTE = "zz.requestId";
    public static final String REQUEST_ID_MDC_KEY = "requestId";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String incoming = request.getHeader("X-Request-Id");
        String requestId = UuidUtils.isUuid(incoming) ? incoming : UuidUtils.newUuidV4();

        MDC.put(REQUEST_ID_MDC_KEY, requestId);
        request.setAttribute(REQUEST_ID_ATTRIBUTE, requestId);

        response.setHeader("X-Request-Id", requestId);
        response.setHeader("X-API-Version", "1");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Cache-Control", "no-store");

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.remove(REQUEST_ID_MDC_KEY);
        }
    }
}
