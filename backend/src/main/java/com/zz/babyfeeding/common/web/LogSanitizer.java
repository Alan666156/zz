package com.zz.babyfeeding.common.web;

/**
 * Sanitises request paths before they are written to logs.
 *
 * <p>The CSV download URL carries a short-lived signed token as a path
 * segment. Anyone with log access could replay it, so only the shape of the
 * path is logged.</p>
 */
public final class LogSanitizer {

    private static final String EXPORT_DOWNLOAD_PREFIX = "/api/v1/exports/feeding-records/";
    private static final String CSV_SUFFIX = ".csv";

    private LogSanitizer() {
    }

    public static String path(String requestUri) {
        if (requestUri == null || !requestUri.startsWith(EXPORT_DOWNLOAD_PREFIX)) {
            return requestUri;
        }
        int suffixStart = requestUri.indexOf(CSV_SUFFIX, EXPORT_DOWNLOAD_PREFIX.length());
        if (suffixStart < 0) {
            return requestUri;
        }
        return EXPORT_DOWNLOAD_PREFIX + "***" + requestUri.substring(suffixStart);
    }
}
