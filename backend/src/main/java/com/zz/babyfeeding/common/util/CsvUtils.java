package com.zz.babyfeeding.common.util;

/**
 * CSV helpers: RFC-4180 quote escaping, CRLF line endings, UTF-8 BOM and
 * spreadsheet formula-injection neutralisation.
 */
public final class CsvUtils {

    public static final String UTF8_BOM = "\uFEFF";
    public static final String CRLF = "\r\n";


    private CsvUtils() {
    }

    public static String header(String... cells) {
        return line(cells);
    }

    public static String line(String... cells) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cells.length; i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append(escape(cells[i]));
        }
        return sb.append(CRLF).toString();
    }

    /**
     * Cells beginning with = + - @ TAB CR are prefixed with a single quote so
     * spreadsheets do not evaluate them as formulas. Values are then quoted
     * when they contain a comma, quote or line break.
     */
    public static String escape(String value) {
        if (value == null) {
            return "";
        }
        String safe = needsFormulaPrefix(value) ? "'" + value : value;
        if (safe.indexOf(',') >= 0 || safe.indexOf('"') >= 0
                || safe.indexOf('\r') >= 0 || safe.indexOf('\n') >= 0) {
            return '"' + safe.replace("\"", "\"\"") + '"';
        }
        return safe;
    }

    private static boolean needsFormulaPrefix(String value) {
        if (value.isEmpty()) {
            return false;
        }
        char first = value.charAt(0);
        return first == '=' || first == '+' || first == '-' || first == '@'
                || first == '\t' || first == '\r';
    }
}
