package com.zz.babyfeeding.common.web;

/**
 * Per-request resolved device identity. Populated by DeviceContextInterceptor;
 * only the hash is used in caches and logs. The raw device id is kept for
 * responses (device init) and never logged.
 */
public final class DeviceContext {

    private static final ThreadLocal<Identity> HOLDER = new ThreadLocal<>();

    private DeviceContext() {
    }

    public static void set(Identity identity) {
        HOLDER.set(identity);
    }

    public static Identity get() {
        return HOLDER.get();
    }

    public static Identity require() {
        Identity identity = HOLDER.get();
        if (identity == null) {
            throw new IllegalStateException("device context is not available for this request");
        }
        return identity;
    }

    public static void clear() {
        HOLDER.remove();
    }

    public record Identity(String deviceId, String hashHex, long deviceRowId) {
    }
}
