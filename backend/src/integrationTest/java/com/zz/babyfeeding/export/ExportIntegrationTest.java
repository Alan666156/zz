package com.zz.babyfeeding.export;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.fasterxml.jackson.databind.JsonNode;
import com.zz.babyfeeding.common.api.GlobalExceptionHandler;
import com.zz.babyfeeding.support.IntegrationTestBase;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Executable EXP-01..EXP-12 acceptance cases (docs/tests §12). Each test starts
 * from an empty schema and flushed Redis, so the 5/hour export window applies
 * per test only.
 */
class ExportIntegrationTest extends IntegrationTestBase {

    private static final String DAY = "2026-10-20";
    private static final String BIRTH_DATE = "2025-01-01";
    private static final String HEADER = CsvExporter.HEADER;
    private static final String DOWNLOAD_PREFIX = "/api/v1/exports/feeding-records/";

    @Value("${app.export-token-key}")
    private String exportTokenKey;

    // ---------------------------------------------------------------- helpers

    private static Map<String, Object> payload(Object... keyValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int index = 0; index < keyValues.length; index += 2) {
            map.put((String) keyValues[index], keyValues[index + 1]);
        }
        return map;
    }

    private String setupDeviceAndBaby(String deviceId) throws Exception {
        initDeviceOk(deviceId);
        MvcResult result = postJson("/api/v1/babies", deviceId, payload(
                "name", "小满",
                "gender", "FEMALE",
                "birthDate", BIRTH_DATE));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return body(result).path("data").path("baby").path("id").asText();
    }

    private JsonNode createFeeding(String deviceId, String babyId, Object... overrides)
            throws Exception {
        Map<String, Object> body = payload(
                "id", UUID.randomUUID().toString(),
                "babyId", babyId,
                "feedType", "FORMULA",
                "amountValue", 120,
                "amountUnit", "ML",
                "startedAt", DAY + "T10:00:00+08:00");
        for (int index = 0; index < overrides.length; index += 2) {
            body.put((String) overrides[index], overrides[index + 1]);
        }
        MvcResult result = postJson("/api/v1/feeding-records", deviceId, body);
        assertThat(result.getResponse().getStatus())
                .as("create feeding body=%s response=%s", body,
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data").path("record");
    }

    private Map<String, String> seedFixture(String deviceId, String babyId) throws Exception {
        Map<String, String> ids = new LinkedHashMap<>();
        ids.put("breastLeft", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "LEFT",
                "amountValue", null, "amountUnit", null,
                "durationSec", 900,
                "startedAt", DAY + "T08:00:00+08:00",
                "endedAt", DAY + "T08:15:00+08:00",
                "note", "中途有点吐奶", "tags", List.of("SPIT_UP"))
                .path("id").asText());
        ids.put("breastRight", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "RIGHT",
                "amountValue", null, "amountUnit", null,
                "durationSec", 600,
                "startedAt", DAY + "T09:00:00+08:00",
                "endedAt", DAY + "T09:10:00+08:00")
                .path("id").asText());
        ids.put("formula120", createFeeding(deviceId, babyId,
                "amountValue", 120, "durationSec", 300,
                "startedAt", DAY + "T10:00:00+08:00",
                "endedAt", DAY + "T10:05:00+08:00")
                .path("id").asText());
        ids.put("formula150", createFeeding(deviceId, babyId,
                "amountValue", 150, "startedAt", DAY + "T11:00:00+08:00")
                .path("id").asText());
        ids.put("mixed", createFeeding(deviceId, babyId,
                "feedType", "MIXED", "breastSide", "BOTH",
                "amountValue", 90, "amountUnit", "ML", "durationSec", 480,
                "startedAt", DAY + "T12:00:00+08:00",
                "endedAt", DAY + "T12:08:00+08:00")
                .path("id").asText());
        ids.put("solid30", createFeeding(deviceId, babyId,
                "feedType", "SOLID", "amountValue", 30, "amountUnit", "G",
                "durationSec", 120, "startedAt", DAY + "T13:00:00+08:00",
                "endedAt", DAY + "T13:02:00+08:00")
                .path("id").asText());
        ids.put("breastBoth", createFeeding(deviceId, babyId,
                "feedType", "BREAST", "breastSide", "BOTH",
                "amountValue", null, "amountUnit", null, "durationSec", 1200,
                "startedAt", DAY + "T14:00:00+08:00",
                "endedAt", DAY + "T14:20:00+08:00")
                .path("id").asText());
        ids.put("solid20", createFeeding(deviceId, babyId,
                "feedType", "SOLID", "amountValue", 20, "amountUnit", "G",
                "startedAt", DAY + "T15:00:00+08:00")
                .path("id").asText());
        String deleted = createFeeding(deviceId, babyId,
                "amountValue", 500, "durationSec", 600,
                "startedAt", DAY + "T16:00:00+08:00",
                "endedAt", DAY + "T16:10:00+08:00")
                .path("id").asText();
        assertThat(deleteJson("/api/v1/feeding-records/" + deleted
                + "?baseRevision=1", deviceId).getResponse().getStatus())
                .isEqualTo(200);
        ids.put("deleted", deleted);
        return ids;
    }

    private JsonNode requestExport(String deviceId, String babyId,
                                   String from, String to) throws Exception {
        MvcResult result = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", from, "to", to));
        assertThat(result.getResponse().getStatus())
                .as("export response=%s",
                        result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .isEqualTo(200);
        return body(result).path("data");
    }

    private MvcResult download(String downloadUrl) throws Exception {
        return getJson(downloadUrl, null);
    }

    private String downloadText(JsonNode ticket) throws Exception {
        MvcResult result = download(ticket.path("downloadUrl").asText());
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        String text = result.getResponse().getContentAsString(StandardCharsets.UTF_8);
        return text.startsWith("﻿") ? text.substring(1) : text;
    }

    private static String tokenOf(String downloadUrl) {
        String token = downloadUrl.substring(downloadUrl.indexOf(DOWNLOAD_PREFIX)
                + DOWNLOAD_PREFIX.length());
        return token.substring(0, token.length() - ".csv".length());
    }

    private static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        int index = 0;
        while (index < text.length()) {
            char current = text.charAt(index);
            if (inQuotes) {
                if (current == '"') {
                    if (index + 1 < text.length() && text.charAt(index + 1) == '"') {
                        field.append('"');
                        index += 2;
                        continue;
                    }
                    inQuotes = false;
                    index++;
                    continue;
                }
                field.append(current);
                index++;
                continue;
            }
            if (current == '"') {
                inQuotes = true;
                index++;
                continue;
            }
            if (current == ',') {
                row.add(field.toString());
                field.setLength(0);
                index++;
                continue;
            }
            if (current == '\r' && index + 1 < text.length()
                    && text.charAt(index + 1) == '\n') {
                row.add(field.toString());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
                index += 2;
                continue;
            }
            if (current == '\n') {
                row.add(field.toString());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
                index++;
                continue;
            }
            field.append(current);
            index++;
        }
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        return rows;
    }

    // ------------------------------------------------------------- EXP-01..04

    @Test
    void ticketHasSignedUrlAndDownloadHeaders() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedFixture(deviceId, babyId);

        long before = Instant.now().toEpochMilli();
        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        long after = Instant.now().toEpochMilli();

        assertThat(ticket.path("rowCount").asInt()).isEqualTo(8);
        String downloadUrl = ticket.path("downloadUrl").asText();
        assertThat(downloadUrl).startsWith(DOWNLOAD_PREFIX).endsWith(".csv");
        String expiresAt = ticket.path("expiresAt").asText();
        assertThat(expiresAt).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z");
        long expiresMillis = Instant.parse(expiresAt).toEpochMilli();
        assertThat(expiresMillis).isBetween(before + 295_000, after + 305_000);

        MvcResult result = download(downloadUrl);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        assertThat(result.getResponse().getHeader("Content-Type"))
                .isEqualTo("text/csv; charset=UTF-8");
        assertThat(result.getResponse().getHeader("Content-Disposition"))
                .isEqualTo("attachment; filename=\"feeding-records-2026-10-20-2026-10-20.csv\"");
        assertThat(result.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(result.getResponse().getHeader("X-Content-Type-Options"))
                .isEqualTo("nosniff");

        byte[] bytes = result.getResponse().getContentAsByteArray();
        MvcResult otherDevice = getJson(downloadUrl, newDeviceId());
        assertThat(otherDevice.getResponse().getStatus()).isEqualTo(200);
        assertThat(otherDevice.getResponse().getContentAsByteArray()).isEqualTo(bytes);
    }

    @Test
    void csvHasBomCrlfHeaderChineseLabelsAndAscendingOrder() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        Map<String, String> ids = seedFixture(deviceId, babyId);

        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        MvcResult result = download(ticket.path("downloadUrl").asText());
        byte[] bytes = result.getResponse().getContentAsByteArray();
        assertThat(new byte[]{bytes[0], bytes[1], bytes[2]})
                .isEqualTo(CsvExporter.UTF8_BOM);

        String text = downloadText(ticket);
        assertThat(text).endsWith("\r\n");
        String[] lines = text.split("\r\n", -1);
        assertThat(lines[0]).isEqualTo(HEADER);
        assertThat(lines).hasSize(10);
        assertThat(text).contains("小满").contains("母乳");
        assertThat(text).doesNotContain(ids.get("deleted"));

        List<List<String>> rows = parseCsv(text);
        assertThat(rows).hasSize(9);
        assertThat(rows.get(1)).containsExactly(
                ids.get("breastLeft"), "小满", "母乳",
                "2026-10-20T08:00:00+08:00", "2026-10-20T08:15:00+08:00",
                "900", "左侧", "", "", "中途有点吐奶", "吐奶", "2026-10-20");
        assertThat(rows.get(8).get(3)).isEqualTo("2026-10-20T15:00:00+08:00");

        List<String> formula = rows.get(3);
        assertThat(formula.get(2)).isEqualTo("配方奶");
        assertThat(formula.get(7)).isEqualTo("120.0");
        assertThat(formula.get(8)).isEqualTo("毫升");
        List<String> mixed = rows.get(5);
        assertThat(mixed.get(2)).isEqualTo("混合");
        assertThat(mixed.get(6)).isEqualTo("双侧");
        List<String> solid = rows.get(6);
        assertThat(solid.get(2)).isEqualTo("辅食");
        assertThat(solid.get(8)).isEqualTo("克");

        JsonNode secondTicket = requestExport(deviceId, babyId, DAY, DAY);
        List<List<String>> secondRows = parseCsv(downloadText(secondTicket));
        assertThat(secondRows).hasSize(9);

        createFeeding(deviceId, babyId,
                "startedAt", DAY + "T17:00:00+08:00",
                "endedAt", null, "durationSec", null,
                "tags", List.of("SLEEPY", "SPIT_UP"), "note", null);
        JsonNode thirdTicket = requestExport(deviceId, babyId, DAY, DAY);
        List<List<String>> thirdRows = parseCsv(downloadText(thirdTicket));
        assertThat(thirdRows).hasSize(10);
        assertThat(thirdRows.get(9).get(10)).isEqualTo("吐奶|困倦");
    }

    // ------------------------------------------------------------- EXP-05..07

    @Test
    void escapesQuotesCommasAndNewlinesInNoteAndBabyName() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        String note = "a,b\"c\r\nd";
        createFeeding(deviceId, babyId, "note", note, "tags", List.of());

        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        String text = downloadText(ticket);
        assertThat(text).contains("\"a,b\"\"c\r\nd\"");
        List<List<String>> rows = parseCsv(text);
        assertThat(rows.get(1).get(9)).isEqualTo(note);

        MvcResult renamed = patchJson("/api/v1/babies/" + babyId, deviceId,
                payload("baseRevision", 1, "name", "小,满"));
        assertThat(renamed.getResponse().getStatus()).isEqualTo(200);

        JsonNode renamedTicket = requestExport(deviceId, babyId, DAY, DAY);
        List<List<String>> renamedRows = parseCsv(downloadText(renamedTicket));
        assertThat(renamedRows.get(1).get(1)).isEqualTo("小,满");
    }

    @Test
    void prefixesFormulaInjectionCharacters() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        List<String> notes = List.of("=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tTAB", "\rCR");
        for (int index = 0; index < notes.size(); index++) {
            createFeeding(deviceId, babyId,
                    "startedAt", String.format("%sT%02d:00:00+08:00", DAY, 8 + index),
                    "note", notes.get(index), "tags", List.of());
        }

        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        List<List<String>> rows = parseCsv(downloadText(ticket));
        assertThat(rows).hasSize(7);
        List<String> noteCells = rows.subList(1, rows.size()).stream()
                .map(row -> row.get(9)).toList();
        assertThat(noteCells).hasSize(6);
        assertThat(noteCells).allSatisfy(cell -> assertThat(cell).startsWith("'"));
        assertThat(noteCells).noneMatch(cell -> cell.startsWith("=1+1"));
    }

    @Test
    void emptyExportStillReturnsTheHeader() throws Exception {
        String deviceId = newDeviceId();
        setupDeviceAndBaby(deviceId);
        JsonNode emptyBaby = createBaby(deviceId, "空宝宝", false);
        String emptyBabyId = emptyBaby.path("id").asText();

        JsonNode ticket = requestExport(deviceId, emptyBabyId, DAY, DAY);
        assertThat(ticket.path("rowCount").asInt()).isZero();
        assertThat(downloadText(ticket)).isEqualTo(HEADER + "\r\n");
    }

    // ------------------------------------------------------------- EXP-08..09

    @Test
    void exportScopesToTheRequestedBabyAndDeletedBabyTokenIs404() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedFixture(deviceId, babyId);
        JsonNode otherBaby = createBaby(deviceId, "B2", false);
        String otherBabyId = otherBaby.path("id").asText();
        createFeeding(deviceId, otherBabyId, "startedAt", DAY + "T18:00:00+08:00");
        createFeeding(deviceId, otherBabyId, "startedAt", DAY + "T19:00:00+08:00");

        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        List<List<String>> rows = parseCsv(downloadText(ticket));
        assertThat(rows).hasSize(9);
        assertThat(rows.subList(1, rows.size())).allSatisfy(
                row -> assertThat(row.get(1)).isEqualTo("小满"));

        String token = tokenOf(ticket.path("downloadUrl").asText());
        assertThat(deleteJson("/api/v1/babies/" + babyId + "?baseRevision=1", deviceId)
                .getResponse().getStatus()).isEqualTo(200);

        MvcResult afterDelete = download(DOWNLOAD_PREFIX + token + ".csv");
        assertError(afterDelete, 404, "NOT_FOUND");
    }

    @Test
    void invalidExportParametersAreRejected() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        List<Map<String, Object>> invalid = List.of(
                payload("from", DAY, "to", DAY),
                payload("babyId", babyId),
                payload("babyId", babyId, "from", "2026-10-21", "to", DAY),
                payload("babyId", babyId, "from", "2026/10/20", "to", DAY),
                // Q-27: a 367-day span is a resource limit (413), not a 400.
                payload("babyId", babyId, "from", DAY));

        for (Map<String, Object> body : invalid) {
            assertError(postJson("/api/v1/exports/feeding-records", deviceId, body),
                    400, "VALIDATION_ERROR");
        }
    }

    @Test
    void rejectsSpanOver366DaysAsExportTooLarge() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        MvcResult tooLarge = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", "2025-10-19", "to", "2026-10-20"));

        assertError(tooLarge, 413, "EXPORT_TOO_LARGE");
        JsonNode data = body(tooLarge).path("data");
        assertThat(data.path("maxDays").asInt()).isEqualTo(366);
        assertThat(data.path("from").asText()).isEqualTo("2025-10-19");
        assertThat(data.path("to").asText()).isEqualTo("2026-10-20");
        assertThat(data.path("spanDays").asInt()).isEqualTo(367);
        // Span is checked before the row count: only the span variant is sent.
        assertThat(data.has("rowCount")).isFalse();
        assertThat(data.has("maxRows")).isFalse();

        // Q-20: the reservation was rolled back, so the quota is untouched.
        assertThat(tooLarge.getResponse().getHeader("X-RateLimit-Limit")).isEqualTo("5");
        assertThat(tooLarge.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("5");
        assertThat(tooLarge.getResponse().getHeader("Retry-After")).isNull();

        MvcResult issued = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", DAY, "to", DAY));
        assertThat(issued.getResponse().getStatus()).isEqualTo(200);
        assertThat(issued.getResponse().getHeader("X-RateLimit-Remaining")).isEqualTo("4");
    }

    @Test
    void accepts366DaysAndRejectsForeignBabies() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        MvcResult boundary = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", "2025-10-20", "to", "2026-10-20"));
        assertThat(boundary.getResponse().getStatus()).isEqualTo(200);

        String otherDevice = newDeviceId();
        initDeviceOk(otherDevice);
        MvcResult foreign = postJson("/api/v1/exports/feeding-records", otherDevice,
                payload("babyId", babyId, "from", DAY, "to", DAY));
        assertError(foreign, 404, "NOT_FOUND");
    }

    // ------------------------------------------------------------- EXP-10..12

    @Test
    void tokenTamperingExpiryAndPayloadShape() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        seedFixture(deviceId, babyId);
        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        String downloadUrl = ticket.path("downloadUrl").asText();
        String token = tokenOf(downloadUrl);
        assertThat(downloadUrl).doesNotContain(deviceId);

        String payloadPart = token.substring(0, token.lastIndexOf('.'));
        String signaturePart = token.substring(token.lastIndexOf('.') + 1);
        assertThat(signaturePart).hasSize(43);

        // Flip the first signature character: all six bits of a 43-char
        // base64url encoding's first character are significant, while the last
        // character's low bits are decoder-ignored padding.
        char tamperedChar = signaturePart.charAt(0) == 'A' ? 'B' : 'A';
        String tampered = payloadPart + "." + tamperedChar + signaturePart.substring(1);
        assertError(download(DOWNLOAD_PREFIX + tampered + ".csv"),
                403, "EXPORT_TOKEN_INVALID");

        JsonNode decodedPayload = objectMapper.readTree(
                Base64.getUrlDecoder().decode(payloadPart));
        List<String> keys = new ArrayList<>();
        decodedPayload.fieldNames().forEachRemaining(keys::add);
        assertThat(keys).containsExactlyInAnyOrder("v", "d", "b", "f", "t", "e", "n");
        assertThat(decodedPayload.path("v").asInt()).isEqualTo(1);
        assertThat(decodedPayload.path("b").asText()).isEqualTo(babyId);
        assertThat(decodedPayload.path("f").asText()).isEqualTo(DAY);
        assertThat(decodedPayload.path("t").asText()).isEqualTo(DAY);
        assertThat(decodedPayload.path("d").asText())
                .isEqualTo(deviceIdHasher.hashHex(deviceId));
        assertThat(decodedPayload.path("n").asText())
                .matches("[0-9a-f-]{36}");
        long ttl = decodedPayload.path("e").asLong() - Instant.now().getEpochSecond();
        assertThat(ttl).isBetween(295L, 300L);

        Map<String, Object> forged = payload(
                "v", 1,
                "d", decodedPayload.path("d").asText(),
                "b", UUID.randomUUID().toString(),
                "f", DAY,
                "t", DAY,
                "e", decodedPayload.path("e").asLong(),
                "n", UUID.randomUUID().toString());
        String forgedPayload = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(objectMapper.writeValueAsBytes(forged));
        assertError(download(DOWNLOAD_PREFIX + forgedPayload + "."
                + signaturePart + ".csv"), 403, "EXPORT_TOKEN_INVALID");

        String expired = signExpiredToken(deviceIdHasher.hashHex(deviceId), babyId);
        assertError(download(DOWNLOAD_PREFIX + expired + ".csv"),
                410, "EXPORT_TOKEN_EXPIRED");
    }

    private String signExpiredToken(String deviceHashHex, String babyId) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("v", 1);
        payload.put("d", deviceHashHex);
        payload.put("b", babyId);
        payload.put("f", DAY);
        payload.put("t", DAY);
        payload.put("e", Instant.now().getEpochSecond() - 1);
        payload.put("n", UUID.randomUUID().toString());
        String payloadPart = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(objectMapper.writeValueAsBytes(payload));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(
                exportTokenKey.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getUrlEncoder().withoutPadding().encodeToString(
                mac.doFinal(payloadPart.getBytes(StandardCharsets.US_ASCII)));
        return payloadPart + "." + signature;
    }

    // --------------------------------------------------------- FIX-BE-01/02

    /**
     * The CSV download accepts any request Accept (browsers send text/html,
     * test clients text/csv). Errors must still be the contract JSON envelope,
     * not HTTP 406/500.
     */
    @Test
    void downloadErrorsAreJsonEvenWithCsvOrHtmlAccept() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        String token = tokenOf(ticket.path("downloadUrl").asText());

        String payloadPart = token.substring(0, token.lastIndexOf('.'));
        String signaturePart = token.substring(token.lastIndexOf('.') + 1);
        char tamperedChar = signaturePart.charAt(0) == 'A' ? 'B' : 'A';
        String tampered = payloadPart + "." + tamperedChar + signaturePart.substring(1);

        MvcResult csvAccept = mockMvc.perform(get(DOWNLOAD_PREFIX + tampered + ".csv")
                        .accept(MediaType.parseMediaType("text/csv")))
                .andReturn();
        assertError(csvAccept, 403, "EXPORT_TOKEN_INVALID");
        assertJsonError(csvAccept);

        String expired = signExpiredToken(deviceIdHasher.hashHex(deviceId), babyId);
        MvcResult htmlAccept = mockMvc.perform(get(DOWNLOAD_PREFIX + expired + ".csv")
                        .accept(MediaType.TEXT_HTML))
                .andReturn();
        assertError(htmlAccept, 410, "EXPORT_TOKEN_EXPIRED");
        assertJsonError(htmlAccept);

        // Token issued before the baby was deleted, downloaded with a
        // browser-like Accept: still 404 + JSON.
        assertThat(deleteJson("/api/v1/babies/" + babyId + "?baseRevision=1", deviceId)
                .getResponse().getStatus()).isEqualTo(200);
        MvcResult deleted = mockMvc.perform(get(DOWNLOAD_PREFIX + token + ".csv")
                        .accept(MediaType.TEXT_HTML))
                .andReturn();
        assertError(deleted, 404, "NOT_FOUND");
        assertJsonError(deleted);
    }

    @Test
    void responsesCarryExactlyOneNoStoreCacheControl() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);

        MvcResult ticket = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", DAY, "to", DAY));
        assertThat(ticket.getResponse().getStatus()).isEqualTo(200);
        assertThat(ticket.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(ticket.getResponse().getHeaders("Cache-Control"))
                .containsExactly("no-store");

        MvcResult file = download(body(ticket).path("data").path("downloadUrl").asText());
        assertThat(file.getResponse().getStatus()).isEqualTo(200);
        assertThat(file.getResponse().getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(file.getResponse().getHeaders("Cache-Control"))
                .containsExactly("no-store");
        assertThat(file.getResponse().getHeader("X-Content-Type-Options"))
                .isEqualTo("nosniff");
    }

    /** FIX-BE-04: the signed token must never reach the error log. */
    @Test
    void errorLogsNeverContainTheRawDownloadToken() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        JsonNode ticket = requestExport(deviceId, babyId, DAY, DAY);
        String token = tokenOf(ticket.path("downloadUrl").asText());
        String payloadPart = token.substring(0, token.lastIndexOf('.'));
        String signaturePart = token.substring(token.lastIndexOf('.') + 1);
        char tamperedChar = signaturePart.charAt(0) == 'A' ? 'B' : 'A';
        String tampered = payloadPart + "." + tamperedChar + signaturePart.substring(1);

        Logger handlerLogger = (Logger) LoggerFactory.getLogger(GlobalExceptionHandler.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        handlerLogger.addAppender(appender);
        try {
            MvcResult result = mockMvc.perform(get(DOWNLOAD_PREFIX + tampered + ".csv")
                            .accept(MediaType.parseMediaType("text/csv")))
                    .andReturn();
            assertError(result, 403, "EXPORT_TOKEN_INVALID");
        } finally {
            handlerLogger.detachAppender(appender);
            appender.stop();
        }

        List<String> messages = appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage).toList();
        assertThat(messages).isNotEmpty();
        assertThat(messages).anySatisfy(message ->
                assertThat(message).contains("/api/v1/exports/feeding-records/***.csv"));
        assertThat(messages).noneSatisfy(message ->
                assertThat(message).contains(token));
        assertThat(messages).noneSatisfy(message ->
                assertThat(message).contains(tampered));
    }

    private static void assertJsonError(MvcResult result) {
        String contentType = result.getResponse().getHeader("Content-Type");
        assertThat(contentType).startsWith("application/json");
        assertThat(contentType).contains("charset=UTF-8");
    }

    @Test
    void moreThanTenThousandRowsIsRejected() throws Exception {
        String deviceId = newDeviceId();
        String babyId = setupDeviceAndBaby(deviceId);
        long deviceRowId = deviceRowId(deviceId);

        String insertSql = """
                INSERT INTO feeding_record
                  (id, device_id, baby_id, feed_type, amount_value, amount_unit,
                   started_at, tz_offset_minutes, record_date)
                VALUES (?, ?, ?, 'FORMULA', 100.00, 'ML',
                        '2026-10-01 00:00:00.000', 480, '2026-10-01')
                """;
        List<Object[]> batch = new ArrayList<>();
        String removableId = null;
        for (int index = 0; index < 10_001; index++) {
            String id = UUID.randomUUID().toString();
            if (index == 0) {
                removableId = id;
            }
            batch.add(new Object[]{id, deviceRowId, babyId});
        }
        jdbcTemplate.batchUpdate(insertSql, batch);

        MvcResult tooLarge = postJson("/api/v1/exports/feeding-records", deviceId,
                payload("babyId", babyId, "from", "2026-10-01", "to", "2026-10-01"));
        assertError(tooLarge, 413, "EXPORT_TOO_LARGE");
        JsonNode errorData = body(tooLarge).path("data");
        assertThat(errorData.path("rowCount").asLong()).isEqualTo(10_001L);
        assertThat(errorData.path("maxRows").asInt()).isEqualTo(10_000);
        assertThat(errorData.has("downloadUrl")).isFalse();

        jdbcTemplate.update("DELETE FROM feeding_record WHERE id = ?", removableId);

        JsonNode exactly = requestExport(deviceId, babyId, "2026-10-01", "2026-10-01");
        assertThat(exactly.path("rowCount").asInt()).isEqualTo(10_000);
    }
}
