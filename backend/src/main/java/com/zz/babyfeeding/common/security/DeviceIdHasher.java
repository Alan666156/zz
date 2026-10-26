package com.zz.babyfeeding.common.security;

import com.zz.babyfeeding.config.AppProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;

/**
 * HMAC-SHA256(APP_DEVICE_PEPPER, deviceId). The raw device id is never stored;
 * only the 32-byte digest reaches MySQL. A new Mac instance is created per call
 * because Mac is not thread-safe.
 */
@Component
public class DeviceIdHasher {

    private static final String ALGORITHM = "HmacSHA256";

    private final SecretKeySpec keySpec;

    public DeviceIdHasher(AppProperties appProperties) {
        this.keySpec = new SecretKeySpec(
                appProperties.getDevicePepper().getBytes(StandardCharsets.UTF_8), ALGORITHM);
    }

    public byte[] hash(String deviceId) {
        try {
            Mac mac = Mac.getInstance(ALGORITHM);
            mac.init(keySpec);
            return mac.doFinal(deviceId.getBytes(StandardCharsets.UTF_8));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC-SHA256 is not available", ex);
        }
    }

    public String hashHex(String deviceId) {
        return HexFormat.of().formatHex(hash(deviceId));
    }

    public static String toHex(byte[] value) {
        return HexFormat.of().formatHex(value);
    }
}
