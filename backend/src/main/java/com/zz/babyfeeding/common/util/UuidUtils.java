package com.zz.babyfeeding.common.util;

import java.util.UUID;
import java.util.regex.Pattern;

/**
 * UUID validation. Domain ids are exact lower-case canonical UUID v4; uppercase
 * or otherwise non-canonical values are rejected rather than normalised (Q-13).
 */
public final class UuidUtils {

    private static final Pattern UUID_V4 = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");

    private UuidUtils() {
    }

    public static boolean isUuidV4(String value) {
        return value != null && UUID_V4.matcher(value).matches();
    }

    /** Accepts any RFC-4122 UUID; used for request ids supplied by clients. */
    public static boolean isUuid(String value) {
        if (value == null || value.length() != 36) {
            return false;
        }
        try {
            UUID.fromString(value);
            return true;
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    /** Generates a lower-case canonical UUID v4. */
    public static String newUuidV4() {
        return UUID.randomUUID().toString();
    }
}
