package com.zz.babyfeeding.common.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class CsvUtilsTest {

    @Test
    void exposesUtf8Bom() {
        assertThat(CsvUtils.UTF8_BOM).isEqualTo("\uFEFF");
        assertThat(CsvUtils.UTF8_BOM.getBytes(java.nio.charset.StandardCharsets.UTF_8))
                .containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
    }

    @Test
    void neutralisesFormulaInjection() {
        assertThat(CsvUtils.escape("=SUM(A1:A2)")).isEqualTo("'=SUM(A1:A2)");
        assertThat(CsvUtils.escape("+1")).isEqualTo("'+1");
        assertThat(CsvUtils.escape("-1")).isEqualTo("'-1");
        assertThat(CsvUtils.escape("@cmd")).isEqualTo("'@cmd");
        assertThat(CsvUtils.escape("\tabc")).isEqualTo("'\tabc");
        assertThat(CsvUtils.escape("\rabc")).isEqualTo("\"'\rabc\"");
    }

    @Test
    void quotesCommasQuotesAndNewlines() {
        assertThat(CsvUtils.escape("a,b")).isEqualTo("\"a,b\"");
        assertThat(CsvUtils.escape("he said \"hi\"")).isEqualTo("\"he said \"\"hi\"\"\"");
        assertThat(CsvUtils.escape("line1\nline2")).isEqualTo("\"line1\nline2\"");
        assertThat(CsvUtils.escape("line1\r\nline2")).isEqualTo("\"line1\r\nline2\"");
    }

    @Test
    void leavesPlainUtf8UntouchedAndHandlesNull() {
        assertThat(CsvUtils.escape("小满")).isEqualTo("小满");
        assertThat(CsvUtils.escape("")).isEmpty();
        assertThat(CsvUtils.escape(null)).isEmpty();
    }

    @Test
    void buildsCrlfRows() {
        assertThat(CsvUtils.line("a", "b", "c")).isEqualTo("a,b,c\r\n");
        assertThat(CsvUtils.header("记录ID", "宝宝昵称")).isEqualTo("记录ID,宝宝昵称\r\n");
        assertThat(CsvUtils.line("x,y", null)).isEqualTo("\"x,y\",\r\n");
    }
}
