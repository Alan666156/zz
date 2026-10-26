package com.zz.babyfeeding.sync;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.sync.dto.SyncPushRequest;
import com.zz.babyfeeding.sync.dto.SyncPushResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/sync")
public class SyncController {

    private final SyncService syncService;

    public SyncController(SyncService syncService) {
        this.syncService = syncService;
    }

    @PostMapping("/push")
    public ApiResponse<SyncPushResponse> push(
            @RequestBody(required = false) SyncPushRequest request) {
        return ApiResponse.ok(syncService.push(DeviceContext.require(), request));
    }
}
