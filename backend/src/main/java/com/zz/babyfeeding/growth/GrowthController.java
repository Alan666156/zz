package com.zz.babyfeeding.growth;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.PageResult;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.growth.dto.CreateGrowthRecordRequest;
import com.zz.babyfeeding.growth.dto.CreateGrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.DeleteGrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.GrowthRecordResponse;
import com.zz.babyfeeding.growth.dto.PatchGrowthRecordRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/growth-records")
public class GrowthController {

    private final GrowthService growthService;

    public GrowthController(GrowthService growthService) {
        this.growthService = growthService;
    }

    @PostMapping
    public ApiResponse<CreateGrowthRecordResponse> create(
            @RequestBody CreateGrowthRecordRequest request) {
        return ApiResponse.ok(growthService.create(DeviceContext.require(), request));
    }

    @GetMapping
    public ApiResponse<PageResult<GrowthRecordResponse>> list(
            @RequestParam(required = false) String babyId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ApiResponse.ok(growthService.list(DeviceContext.require(), babyId,
                from, to, page, size));
    }

    @GetMapping("/latest")
    public ApiResponse<GrowthRecordResponse> latest(
            @RequestParam(required = false) String babyId) {
        return ApiResponse.ok(growthService.latest(DeviceContext.require(), babyId));
    }

    @GetMapping("/{id}")
    public ApiResponse<GrowthRecordResponse> get(@PathVariable String id) {
        return ApiResponse.ok(growthService.get(DeviceContext.require(), id));
    }

    @PatchMapping("/{id}")
    public ApiResponse<GrowthRecordResponse> patch(
            @PathVariable String id,
            @RequestBody PatchGrowthRecordRequest request) {
        return ApiResponse.ok(growthService.patch(DeviceContext.require(), id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<DeleteGrowthRecordResponse> delete(
            @PathVariable String id,
            @RequestParam(required = false) Integer baseRevision) {
        return ApiResponse.ok(growthService.delete(DeviceContext.require(), id, baseRevision));
    }
}
