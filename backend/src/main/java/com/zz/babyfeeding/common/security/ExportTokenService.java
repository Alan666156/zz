package com.zz.babyfeeding.common.security;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.config.AppProperties;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * HMAC-signed CSV export token:
 * base64url(payload) + "." + base64url(HMAC-SHA256(APP_EXPORT_TOKEN_KEY, payload)).
 * TTL is 5 minutes. Verification distinguishes invalid signatures from expiry.
 */
@Service
public class ExportTokenService {

    private static final int PAYLOAD_VERSION = 1;
    private static final int MAX_TOKEN_LENGTH = 4096;
    private static final TypeReference<Map<String, Object>> MAP_TYPE = new TypeReference<>() {
    };

    private final SecretKeySpec keySpec;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private final long ttlSeconds;
    private final Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();
    private final Base64.Decoder decoder = Base64.getUrlDecoder();

    public ExportTokenService(AppProperties appProperties, ObjectMapper objectMapper, Clock clock) {
        this.keySpec = new SecretKeySpec(
                appProperties.getExportTokenKey().getBytes(StandardCharsets.UTF_8), "HmacSHA256");
        this.objectMapper = objectMapper;
        this.clock = clock;
        this.ttlSeconds = appProperties.getExportTokenTtlSeconds();
    }

    public IssuedToken issue(String deviceHashHex, String babyId, LocalDate from, LocalDate to) {
        long expiresAtEpochSecond = clock.instant().getEpochSecond() + ttlSeconds;
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("v", PAYLOAD_VERSION);
        payload.put("d", deviceHashHex);
        payload.put("b", babyId);
        payload.put("f", from.toString());
        payload.put("t", to.toString());
        payload.put("e", expiresAtEpochSecond);
        payload.put("n", UuidUtils.newUuidV4());

        try {
            byte[] json = objectMapper.writeValueAsBytes(payload);
            String payloadPart = encoder.encodeToString(json);
            String signature = encoder.encodeToString(sign(payloadPart));
            return new IssuedToken(payloadPart + "." + signature,
                    Instant.ofEpochSecond(expiresAtEpochSecond));
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to issue export token", ex);
        }
    }

    public ExportTokenPayload verify(String token) {
        if (token == null || token.isBlank() || token.length() > MAX_TOKEN_LENGTH) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
        int separator = token.indexOf('.');
        if (separator <= 0 || separator != token.lastIndexOf('.') || separator == token.length() - 1) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
        String payloadPart = token.substring(0, separator);
        String signaturePart = token.substring(separator + 1);

        byte[] suppliedSignature;
        try {
            suppliedSignature = decoder.decode(signaturePart);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
        byte[] expectedSignature = sign(payloadPart);
        if (!MessageDigest.isEqual(expectedSignature, suppliedSignature)) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }

        Map<String, Object> payload;
        try {
            payload = objectMapper.readValue(decoder.decode(payloadPart), MAP_TYPE);
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }

        try {
            int version = ((Number) payload.get("v")).intValue();
            String deviceHash = (String) payload.get("d");
            String babyId = (String) payload.get("b");
            LocalDate from = LocalDate.parse((String) payload.get("f"));
            LocalDate to = LocalDate.parse((String) payload.get("t"));
            long expiresAt = ((Number) payload.get("e")).longValue();
            String nonce = (String) payload.get("n");
            if (version != PAYLOAD_VERSION
                    || deviceHash == null || deviceHash.isBlank()
                    || babyId == null || babyId.isBlank()
                    || nonce == null || nonce.isBlank()
                    || from.isAfter(to)) {
                throw new IllegalArgumentException("malformed payload");
            }
            if (clock.instant().getEpochSecond() >= expiresAt) {
                throw new BusinessException(ErrorCode.EXPORT_TOKEN_EXPIRED);
            }
            return new ExportTokenPayload(version, deviceHash, babyId, from, to,
                    Instant.ofEpochSecond(expiresAt), nonce);
        } catch (BusinessException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
    }

    private byte[] sign(String payloadPart) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(keySpec);
            return mac.doFinal(payloadPart.getBytes(StandardCharsets.US_ASCII));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 is not available", ex);
        }
    }

    public record IssuedToken(String token, Instant expiresAt) {
    }

    public record ExportTokenPayload(
            int version,
            String deviceHash,
            String babyId,
            LocalDate from,
            LocalDate to,
            Instant expiresAt,
            String nonce
    ) {
    }
}
