package com.zz.babyfeeding.export;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.export.dto.CreateExportRequest;
import com.zz.babyfeeding.export.dto.ExportTicketResponse;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/exports")
public class ExportController {

    private final ExportService exportService;

    public ExportController(ExportService exportService) {
        this.exportService = exportService;
    }

    @PostMapping("/feeding-records")
    public ResponseEntity<ApiResponse<ExportTicketResponse>> create(
            @RequestBody(required = false) CreateExportRequest request) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(ApiResponse.ok(
                        exportService.createExport(DeviceContext.require(), request)));
    }

    /** Token is the capability; this route is exempt from the device header. */
    @GetMapping("/feeding-records/{token}.csv")
    public void download(@PathVariable("token") String token,
                         HttpServletResponse response) throws IOException {
        ExportService.Download download = exportService.prepareDownload(token);
        response.setStatus(HttpServletResponse.SC_OK);
        response.setHeader(HttpHeaders.CONTENT_TYPE, "text/csv; charset=UTF-8");
        response.setHeader(HttpHeaders.CONTENT_DISPOSITION,
                "attachment; filename=\"" + download.filename() + "\"");
        response.setHeader(HttpHeaders.CACHE_CONTROL, "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        exportService.writeCsv(download, response.getOutputStream());
    }
}
