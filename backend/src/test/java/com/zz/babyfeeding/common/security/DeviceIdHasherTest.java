package com.zz.babyfeeding.common.security;

import com.zz.babyfeeding.config.AppProperties;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class DeviceIdHasherTest {

    private static AppProperties properties(String pepper) {
        AppProperties properties = new AppProperties();
        properties.setDevicePepper(pepper);
        properties.setExportTokenKey("unused-export-key-123456");
        return properties;
    }

    @Test
    void hashesDeviceIdWithHmacSha256() {
        DeviceIdHasher hasher = new DeviceIdHasher(properties("pepper-1234567890"));

        byte[] hash = hasher.hash("device-1");

        assertThat(hash).hasSize(32);
        assertThat(HexFormat.of().formatHex(hash))
                .isEqualTo("6d68afd5eefb7b5232a4172288be14a7e8103f8324a20daaa6f65053d440737c");
        assertThat(hasher.hashHex("device-1"))
                .isEqualTo("6d68afd5eefb7b5232a4172288be14a7e8103f8324a20daaa6f65053d440737c");
    }

    @Test
    void differentPepperProducesDifferentDigest() {
        DeviceIdHasher first = new DeviceIdHasher(properties("pepper-1234567890"));
        DeviceIdHasher second = new DeviceIdHasher(properties("another-pepper-098765"));

        assertThat(first.hashHex("device-1")).isNotEqualTo(second.hashHex("device-1"));
    }

    @Test
    void digestIsStableForSameInput() {
        DeviceIdHasher hasher = new DeviceIdHasher(properties("pepper-1234567890"));

        assertThat(hasher.hashHex("device-1"))
                .isEqualTo(hasher.hashHex("device-1"))
                .hasSize(64)
                .matches("[0-9a-f]{64}");
    }

    @Test
    void hashesUtf8Input() {
        DeviceIdHasher hasher = new DeviceIdHasher(properties("pepper-1234567890"));

        assertThat(hasher.hash("设备-一")).isEqualTo(
                hasher.hash(new String("设备-一".getBytes(StandardCharsets.UTF_8),
                        StandardCharsets.UTF_8)));
    }
}
