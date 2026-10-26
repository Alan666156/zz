package com.zz.babyfeeding.export;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zz.babyfeeding.feeding.FeedingTagCodec;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class CsvExporterTest {

    private final CsvExporter exporter =
            new CsvExporter(new FeedingTagCodec(new ObjectMapper()));

    private static CsvExporter.Row row(String feedType,
                                       LocalDateTime startedAt,
                                       LocalDateTime endedAt,
                                       Integer durationSec,
                                       String breastSide,
                                       BigDecimal amount,
                                       String unit,
                                       String note,
                                       String tags) {
        return new CsvExporter.Row("id-1", "小满", feedType, startedAt, 480, endedAt,
                durationSec, breastSide, amount, unit, note, tags,
                LocalDate.parse("2026-10-20"));
    }

    @Test
    void headerMatchesTheLockedContract() {
        assertThat(CsvExporter.HEADER).isEqualTo(
                "记录ID,宝宝昵称,喂养类型,开始时间,结束时间,喂养时长(秒),母乳侧别,"
                        + "奶量/辅食量,单位,备注,标签,记录日期");
    }

    @Test
    void writesTheLockedFirstFixtureRow() {
        CsvExporter.Row row = new CsvExporter.Row(
                "8f14e45f-ceea-4e7a-9d7b-3c1e2f4a5b6c",
                "小满",
                "BREAST",
                LocalDateTime.parse("2026-10-20T00:00:00"),
                480,
                LocalDateTime.parse("2026-10-20T00:15:00"),
                900,
                "LEFT",
                null,
                null,
                "中途有点吐奶",
                "[\"SPIT_UP\"]",
                LocalDate.parse("2026-10-20"));

        assertThat(exporter.line(row)).isEqualTo(
                "8f14e45f-ceea-4e7a-9d7b-3c1e2f4a5b6c,小满,母乳,"
                        + "2026-10-20T08:00:00+08:00,2026-10-20T08:15:00+08:00,900,左侧,,,"
                        + "中途有点吐奶,吐奶,2026-10-20");
    }

    @Test
    void formatsAmountsWithOneDecimalAndLabelsEnums() {
        CsvExporter.Row row = row("FORMULA",
                LocalDateTime.parse("2026-10-20T02:00:00"), null, null, null,
                new BigDecimal("120.00"), "ML", null, null);
        String line = exporter.line(row);
        assertThat(line).contains(",配方奶,");
        assertThat(line).contains(",120.0,");
        assertThat(line).contains(",毫升,");
        assertThat(line).endsWith(",2026-10-20");

        assertThat(CsvExporter.amount(new BigDecimal("30"))).isEqualTo("30.0");
        assertThat(CsvExporter.amount(new BigDecimal("7.25"))).isEqualTo("7.3");
        assertThat(CsvExporter.amount(null)).isEmpty();
        assertThat(CsvExporter.typeLabel("SOLID")).isEqualTo("辅食");
        assertThat(CsvExporter.sideLabel("BOTH")).isEqualTo("双侧");
        assertThat(CsvExporter.unitLabel("G")).isEqualTo("克");
        assertThat(CsvExporter.sideLabel(null)).isEmpty();
    }

    @Test
    void fallsBackToRawCodesAndTreatsBlankAsEmpty() {
        assertThat(CsvExporter.typeLabel("LEGACY")).isEqualTo("LEGACY");
        assertThat(CsvExporter.sideLabel("MIDDLE")).isEqualTo("MIDDLE");
        assertThat(CsvExporter.unitLabel("OZ")).isEqualTo("OZ");
        assertThat(CsvExporter.typeLabel(null)).isEmpty();
        assertThat(CsvExporter.sideLabel(" ")).isEmpty();
        assertThat(CsvExporter.unitLabel(" ")).isEmpty();
    }

    @Test
    void escapesQuotesCommasAndNewlines() {
        assertThat(CsvExporter.cell("a,b\"c\r\nd"))
                .isEqualTo("\"a,b\"\"c\r\nd\"");
        assertThat(CsvExporter.cell("小,满")).isEqualTo("\"小,满\"");
        assertThat(CsvExporter.cell("plain")).isEqualTo("plain");
        assertThat(CsvExporter.cell("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(CsvExporter.cell("a\nb")).isEqualTo("\"a\nb\"");
        assertThat(CsvExporter.cell(null)).isEmpty();
    }

    @Test
    void prefixesFormulaInjectionCharacters() {
        assertThat(CsvExporter.cell("=1+1")).isEqualTo("'=1+1");
        assertThat(CsvExporter.cell("+SUM(A1)")).isEqualTo("'+SUM(A1)");
        assertThat(CsvExporter.cell("-2+3")).isEqualTo("'-2+3");
        assertThat(CsvExporter.cell("@cmd")).isEqualTo("'@cmd");
        assertThat(CsvExporter.cell("\tTAB")).isEqualTo("'\tTAB");
        assertThat(CsvExporter.cell("\rCR")).isEqualTo("\"'\rCR\"");
    }

    @Test
    void tagsAreDeduplicatedAndOrderedByEnumDeclaration() {
        assertThat(exporter.tagsLabel("[\"SLEEPY\",\"SPIT_UP\"]"))
                .isEqualTo("吐奶|困倦");
        assertThat(exporter.tagsLabel("[\"HICCUP\",\"SPIT_UP\",\"SPIT_UP\"]"))
                .isEqualTo("吐奶|打嗝");
        assertThat(exporter.tagsLabel("[]")).isEmpty();
        assertThat(exporter.tagsLabel(null)).isEmpty();
        assertThat(exporter.tagsLabel("[\"UNKNOWN\"]")).isEmpty();
        assertThat(exporter.tagsLabel("[\"SPIT_UP\",null]")).isEqualTo("吐奶");
        assertThat(exporter.tagsLabel("  ")).isEmpty();
    }

    @Test
    void blankRowKeepsTwelveEmptyCells() {
        CsvExporter.Row empty = new CsvExporter.Row(null, null, null, null, 480,
                null, null, null, null, null, null, null, null);
        assertThat(exporter.line(empty)).isEqualTo(",".repeat(11));
    }
}
