package com.zz.babyfeeding.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ExportTokenServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-26T00:00:00Z");
    private static final LocalDate FROM = LocalDate.parse("2026-10-01");
    private static final LocalDate TO = LocalDate.parse("2026-10-26");
    private static final String DEVICE_HASH =
            "e59d098e7affd4960907e796b618984eea76e09606a502e8d0ed5771a3dfef15";
    private static final String BABY_ID = "b1a2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

    private static ExportTokenService service(String key, Instant now) {
        AppProperties properties = new AppProperties();
        properties.setDevicePepper("pepper-1234567890");
        properties.setExportTokenKey(key);
        return new ExportTokenService(properties, new ObjectMapper(),
                Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void issuesAndVerifiesToken() {
        ExportTokenService service = service("export-key-1234567890", NOW);

        ExportTokenService.IssuedToken issued =
                service.issue(DEVICE_HASH, BABY_ID, FROM, TO);
        ExportTokenService.ExportTokenPayload payload = service.verify(issued.token());

        assertThat(issued.token()).contains(".");
        assertThat(issued.expiresAt()).isEqualTo(NOW.plusSeconds(300));
        assertThat(payload.version()).isEqualTo(1);
        assertThat(payload.deviceHash()).isEqualTo(DEVICE_HASH);
        assertThat(payload.babyId()).isEqualTo(BABY_ID);
        assertThat(payload.from()).isEqualTo(FROM);
        assertThat(payload.to()).isEqualTo(TO);
        assertThat(payload.expiresAt()).isEqualTo(issued.expiresAt());
        assertThat(payload.nonce()).isNotBlank();
    }

    @Test
    void rejectsTamperedPayload() {
        ExportTokenService service = service("export-key-1234567890", NOW);
        String token = service.issue(DEVICE_HASH, BABY_ID, FROM, TO).token();
        int dot = token.indexOf('.');
        char original = token.charAt(0);
        String tampered = (original == 'A' ? 'B' : 'A') + token.substring(1);

        assertError(() -> service.verify(tampered), ErrorCode.EXPORT_TOKEN_INVALID);
    }

    @Test
    void rejectsTamperedSignature() {
        ExportTokenService service = service("export-key-1234567890", NOW);
        String token = service.issue(DEVICE_HASH, BABY_ID, FROM, TO).token();
        char last = token.charAt(token.length() - 1);
        String tampered = token.substring(0, token.length() - 1)
                + (last == 'A' ? 'B' : 'A');

        assertError(() -> service.verify(tampered), ErrorCode.EXPORT_TOKEN_INVALID);
    }

    @Test
    void rejectsTokenSignedWithAnotherKey() {
        String token = service("export-key-1234567890", NOW)
                .issue(DEVICE_HASH, BABY_ID, FROM, TO).token();
        ExportTokenService otherKey = service("different-key-0987654321", NOW);

        assertError(() -> otherKey.verify(token), ErrorCode.EXPORT_TOKEN_INVALID);
    }

    @Test
    void rejectsExpiredToken() {
        String token = service("export-key-1234567890", NOW)
                .issue(DEVICE_HASH, BABY_ID, FROM, TO).token();
        ExportTokenService later = service("export-key-1234567890", NOW.plusSeconds(301));

        assertError(() -> later.verify(token), ErrorCode.EXPORT_TOKEN_EXPIRED);
    }

    @Test
    void acceptsTokenExactlyBeforeExpiryAndRejectsAtExpiry() {
        String token = service("export-key-1234567890", NOW)
                .issue(DEVICE_HASH, BABY_ID, FROM, TO).token();

        assertThat(service("export-key-1234567890", NOW.plusSeconds(299))
                .verify(token).babyId()).isEqualTo(BABY_ID);

        assertError(() -> service("export-key-1234567890", NOW.plusSeconds(300)).verify(token),
                ErrorCode.EXPORT_TOKEN_EXPIRED);
    }

    @Test
    void rejectsMalformedTokens() {
        ExportTokenService service = service("export-key-1234567890", NOW);

        for (String token : new String[]{null, "", "abc", "a.b.c", ".abc", "abc."}) {
            assertError(() -> service.verify(token), ErrorCode.EXPORT_TOKEN_INVALID);
        }
    }

    private static void assertError(
            org.assertj.core.api.ThrowableAssert.ThrowingCallable callable,
            ErrorCode expected) {
        assertThatThrownBy(callable)
                .isInstanceOfSatisfying(BusinessException.class,
                        ex -> assertThat(ex.getErrorCode()).isEqualTo(expected));
    }
}
