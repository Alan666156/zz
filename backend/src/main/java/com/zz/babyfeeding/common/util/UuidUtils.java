package com.zz.babyfeeding.common.util;

import com.zz.babyfeeding.common.api.ValidationExceptions;

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

    /** Validates a body/path id and raises VALIDATION_ERROR with the field name. */
    public static String requireUuidV4(String field, String value) {
        if (!isUuidV4(value)) {
            throw ValidationExceptions.field(field, field + " 必须是 UUID v4");
        }
        return value;
    }

    /** Client-supplied id or a generated one when omitted. */
    public static String uuidV4OrGenerate(String field, String value) {
        return value == null ? newUuidV4() : requireUuidV4(field, value);
    }
}
