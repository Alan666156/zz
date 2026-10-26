package com.zz.babyfeeding.common.util;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class UuidUtilsTest {

    @Test
    void acceptsOnlyCanonicalLowerCaseV4() {
        assertThat(UuidUtils.isUuidV4("f47ac10b-58cc-4372-a567-0e02b2c3d479")).isTrue();
        assertThat(UuidUtils.isUuidV4(UUID.randomUUID().toString())).isTrue();
        // Uppercase must be rejected, not normalised (Q-13).
        assertThat(UuidUtils.isUuidV4("F47AC10B-58CC-4372-A567-0E02B2C3D479")).isFalse();
    }

    @Test
    void rejectsNonV4AndMalformedValues() {
        // Version 1 UUID
        assertThat(UuidUtils.isUuidV4("f47ac10b-58cc-1372-a567-0e02b2c3d479")).isFalse();
        // Invalid variant (must be 8, 9, a or b)
        assertThat(UuidUtils.isUuidV4("f47ac10b-58cc-4372-c567-0e02b2c3d479")).isFalse();
        assertThat(UuidUtils.isUuidV4("not-a-uuid")).isFalse();
        assertThat(UuidUtils.isUuidV4(null)).isFalse();
        assertThat(UuidUtils.isUuidV4("")).isFalse();
    }

    @Test
    void isUuidAcceptsAnyRfc4122VersionForRequestIds() {
        assertThat(UuidUtils.isUuid("f47ac10b-58cc-1372-a567-0e02b2c3d479")).isTrue();
        assertThat(UuidUtils.isUuid("abc")).isFalse();
        assertThat(UuidUtils.isUuid(null)).isFalse();
    }
}
