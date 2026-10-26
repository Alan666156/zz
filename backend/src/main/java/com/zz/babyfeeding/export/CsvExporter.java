package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.feeding.AmountUnit;
import com.zz.babyfeeding.feeding.BreastSide;
import com.zz.babyfeeding.feeding.FeedingTag;
import com.zz.babyfeeding.feeding.FeedingTagCodec;
import com.zz.babyfeeding.feeding.FeedingType;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * RFC 4180 CSV row writer for the feeding export (contract 4.9 / Q-01):
 * Chinese enum labels, enum-ordered tags, one-decimal amounts, original offset
 * timestamps and formula-injection escaping.
 */
@Component
public class CsvExporter {

    public static final String HEADER =
            "记录ID,宝宝昵称,喂养类型,开始时间,结束时间,喂养时长(秒),母乳侧别,"
                    + "奶量/辅食量,单位,备注,标签,记录日期";

    public static final byte[] UTF8_BOM = {
            (byte) 0xEF, (byte) 0xBB, (byte) 0xBF
    };

    /** Formula-injection prefix characters from the contract. */
    private static final Set<Character> INJECTION_PREFIXES =
            Set.of('=', '+', '-', '@', '\t', '\r');

    private final FeedingTagCodec tagCodec;

    public CsvExporter(FeedingTagCodec tagCodec) {
        this.tagCodec = tagCodec;
    }

    public String line(Row row) {
        return String.join(",",
                cell(row.id()),
                cell(row.babyName()),
                cell(typeLabel(row.feedType())),
                cell(formatTime(row.startedAtUtc(), row.tzOffsetMinutes())),
                cell(formatTime(row.endedAtUtc(), row.tzOffsetMinutes())),
                cell(row.durationSec() == null ? "" : String.valueOf(row.durationSec())),
                cell(sideLabel(row.breastSide())),
                cell(amount(row.amountValue())),
                cell(unitLabel(row.amountUnit())),
                cell(row.note()),
                cell(tagsLabel(row.tagsJson())),
                cell(row.recordDate() == null ? "" : row.recordDate().toString()));
    }

    /**
     * Escapes one cell: formula prefixes get a leading apostrophe, then the
     * field is quoted when it contains a comma, quote, CR or LF.
     */
    static String cell(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        String value = raw;
        if (INJECTION_PREFIXES.contains(value.charAt(0))) {
            value = "'" + value;
        }
        boolean needsQuotes = value.indexOf(',') >= 0 || value.indexOf('"') >= 0
                || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0;
        if (!needsQuotes) {
            return value;
        }
        return '"' + value.replace("\"", "\"\"") + '"';
    }

    static String amount(BigDecimal value) {
        return value == null ? "" : value.setScale(1, RoundingMode.HALF_UP).toPlainString();
    }

    static String formatTime(LocalDateTime utc, int tzOffsetMinutes) {
        if (utc == null) {
            return "";
        }
        return TimeUtils.formatOffset(TimeUtils.fromUtc(utc, tzOffsetMinutes));
    }

    static String typeLabel(String code) {
        if (code == null) {
            return "";
        }
        try {
            return FeedingType.valueOf(code).label();
        } catch (IllegalArgumentException ex) {
            return code;
        }
    }

    static String sideLabel(String code) {
        if (code == null || code.isBlank()) {
            return "";
        }
        try {
            return BreastSide.valueOf(code).label();
        } catch (IllegalArgumentException ex) {
            return code;
        }
    }

    static String unitLabel(String code) {
        if (code == null || code.isBlank()) {
            return "";
        }
        try {
            return AmountUnit.valueOf(code).label();
        } catch (IllegalArgumentException ex) {
            return code;
        }
    }

    /** Deduplicates, orders by enum declaration and joins with '|' (Q-03). */
    String tagsLabel(String tagsJson) {
        List<String> codes = tagCodec.fromJson(tagsJson);
        if (codes == null || codes.isEmpty()) {
            return "";
        }
        Set<FeedingTag> tags = new LinkedHashSet<>();
        for (String code : codes) {
            if (code == null) {
                continue;
            }
            try {
                tags.add(FeedingTag.valueOf(code));
            } catch (IllegalArgumentException ex) {
                // Historical values are tolerated; unknown codes are not exported.
            }
        }
        return tags.stream()
                .sorted((left, right) -> left.ordinal() - right.ordinal())
                .map(FeedingTag::label)
                .collect(Collectors.joining("|"));
    }

    /** One row read from feeding_record; timestamps are stored UTC. */
    public record Row(String id,
                      String babyName,
                      String feedType,
                      LocalDateTime startedAtUtc,
                      int tzOffsetMinutes,
                      LocalDateTime endedAtUtc,
                      Integer durationSec,
                      String breastSide,
                      BigDecimal amountValue,
                      String amountUnit,
                      String note,
                      String tagsJson,
                      LocalDate recordDate) {
    }
}
