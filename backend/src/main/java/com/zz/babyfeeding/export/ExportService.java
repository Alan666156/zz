package com.zz.babyfeeding.export;

import com.zz.babyfeeding.baby.BabyEntity;
import com.zz.babyfeeding.baby.BabyMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.security.ExportTokenService;
import com.zz.babyfeeding.common.util.TimeUtils;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.device.DeviceMapper;
import com.zz.babyfeeding.export.dto.CreateExportRequest;
import com.zz.babyfeeding.export.dto.ExportTicketResponse;
import com.zz.babyfeeding.feeding.FeedingRecordMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Two-step CSV export (contract 4.9): POST signs a 5-minute token after an
 * ownership/span/row-count check; GET replays the token without a device header
 * and streams the latest rows straight to the response.
 */
@Service
public class ExportService {

    public static final String DOWNLOAD_PATH = "/api/v1/exports/feeding-records/";

    private static final String EXPORT_SQL = """
            SELECT id, feed_type, breast_side, amount_value, amount_unit,
                   duration_sec, note, tags, started_at, ended_at,
                   tz_offset_minutes, record_date
            FROM feeding_record
            WHERE device_id = ? AND baby_id = ? AND deleted_at IS NULL
              AND record_date BETWEEN ? AND ?
            ORDER BY started_at ASC, id ASC
            """;

    private final BabyMapper babyMapper;
    private final FeedingRecordMapper feedingMapper;
    private final DeviceMapper deviceMapper;
    private final ExportTokenService tokenService;
    private final CsvExporter csvExporter;
    private final JdbcTemplate jdbcTemplate;

    public ExportService(BabyMapper babyMapper,
                         FeedingRecordMapper feedingMapper,
                         DeviceMapper deviceMapper,
                         ExportTokenService tokenService,
                         CsvExporter csvExporter,
                         JdbcTemplate jdbcTemplate) {
        this.babyMapper = babyMapper;
        this.feedingMapper = feedingMapper;
        this.deviceMapper = deviceMapper;
        this.tokenService = tokenService;
        this.csvExporter = csvExporter;
        this.jdbcTemplate = jdbcTemplate;
    }

    public ExportTicketResponse createExport(DeviceContext.Identity device,
                                             CreateExportRequest request) {
        String babyId = UuidUtils.requireUuidV4("babyId", request == null ? null
                : request.babyId());
        LocalDate from = ExportValidator.parseDate("from",
                request == null ? null : request.from());
        LocalDate to = ExportValidator.parseDate("to",
                request == null ? null : request.to());
        ExportValidator.validateRange(from, to);

        BabyEntity baby = babyMapper.selectActiveById(babyId, device.deviceRowId());
        if (baby == null) {
            throw notFound();
        }

        long rowCount = feedingMapper.countPage(
                device.deviceRowId(), babyId, from, to, null);
        if (rowCount > ExportValidator.MAX_ROWS) {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("rowCount", rowCount);
            data.put("maxRows", ExportValidator.MAX_ROWS);
            throw new BusinessException(ErrorCode.EXPORT_TOO_LARGE, data);
        }

        ExportTokenService.IssuedToken issued =
                tokenService.issue(device.hashHex(), babyId, from, to);
        return new ExportTicketResponse(
                DOWNLOAD_PATH + issued.token() + ".csv",
                TimeUtils.formatInstant(issued.expiresAt()),
                (int) rowCount);
    }

    /** Verifies the token and resolves its device/baby; no data is written yet. */
    public Download prepareDownload(String token) {
        ExportTokenService.ExportTokenPayload payload = tokenService.verify(token);
        byte[] deviceHash = parseDeviceHash(payload.deviceHash());
        Long deviceRowId = deviceMapper.selectIdByHash(deviceHash);
        if (deviceRowId == null) {
            throw notFound();
        }
        BabyEntity baby = babyMapper.selectActiveById(payload.babyId(), deviceRowId);
        if (baby == null) {
            throw notFound();
        }
        return new Download(baby.getId(), baby.getName(), deviceRowId,
                payload.from(), payload.to(),
                "feeding-records-" + payload.from() + "-" + payload.to() + ".csv");
    }

    /**
     * Writes BOM + header + one line per row as the database cursor yields
     * them, so the full table is never materialised in memory.
     */
    public void writeCsv(Download download, OutputStream outputStream) throws IOException {
        outputStream.write(CsvExporter.UTF8_BOM);
        Writer writer = new BufferedWriter(
                new OutputStreamWriter(outputStream, StandardCharsets.UTF_8));
        writer.write(CsvExporter.HEADER);
        writer.write("\r\n");
        try {
            jdbcTemplate.query(EXPORT_SQL, resultSet -> {
                CsvExporter.Row row = new CsvExporter.Row(
                        resultSet.getString("id"),
                        download.babyName(),
                        resultSet.getString("feed_type"),
                        resultSet.getObject("started_at", LocalDateTime.class),
                        resultSet.getInt("tz_offset_minutes"),
                        resultSet.getObject("ended_at", LocalDateTime.class),
                        resultSet.getObject("duration_sec", Integer.class),
                        resultSet.getString("breast_side"),
                        resultSet.getBigDecimal("amount_value"),
                        resultSet.getString("amount_unit"),
                        resultSet.getString("note"),
                        resultSet.getString("tags"),
                        resultSet.getObject("record_date", LocalDate.class));
                try {
                    writer.write(csvExporter.line(row));
                    writer.write("\r\n");
                } catch (IOException ex) {
                    throw new UncheckedIOException(ex);
                }
            }, download.deviceRowId(), download.babyId(),
                    download.from(), download.to());
        } catch (UncheckedIOException ex) {
            throw ex.getCause();
        }
        writer.flush();
    }

    private static byte[] parseDeviceHash(String hex) {
        if (hex == null || hex.length() != 64) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
        try {
            return HexFormat.of().parseHex(hex);
        } catch (IllegalArgumentException ex) {
            throw new BusinessException(ErrorCode.EXPORT_TOKEN_INVALID);
        }
    }

    private static BusinessException notFound() {
        return new BusinessException(ErrorCode.NOT_FOUND);
    }

    public record Download(String babyId,
                           String babyName,
                           long deviceRowId,
                           LocalDate from,
                           LocalDate to,
                           String filename) {
    }
}
