package com.zz.babyfeeding.baby;

import com.zz.babyfeeding.baby.dto.BabyResponse;
import com.zz.babyfeeding.baby.dto.CreateBabyRequest;
import com.zz.babyfeeding.baby.dto.CreateBabyResponse;
import com.zz.babyfeeding.baby.dto.DeleteBabyResponse;
import com.zz.babyfeeding.baby.dto.PatchBabyRequest;
import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.web.DeviceContext;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/babies")
public class BabyController {

    private final BabyService babyService;

    public BabyController(BabyService babyService) {
        this.babyService = babyService;
    }

    @GetMapping
    public ApiResponse<List<BabyResponse>> list() {
        return ApiResponse.ok(babyService.list(DeviceContext.require()));
    }

    @PostMapping
    public ApiResponse<CreateBabyResponse> create(
            @Valid @RequestBody CreateBabyRequest request) {
        return ApiResponse.ok(babyService.create(DeviceContext.require(), request));
    }

    @GetMapping("/{babyId}")
    public ApiResponse<BabyResponse> get(@PathVariable String babyId) {
        return ApiResponse.ok(babyService.get(DeviceContext.require(), babyId));
    }

    @PatchMapping("/{babyId}")
    public ApiResponse<BabyResponse> patch(@PathVariable String babyId,
                                           @Valid @RequestBody PatchBabyRequest request) {
        return ApiResponse.ok(babyService.patch(DeviceContext.require(), babyId, request));
    }

    @DeleteMapping("/{babyId}")
    public ApiResponse<DeleteBabyResponse> delete(
            @PathVariable String babyId,
            @RequestParam(required = false) Integer baseRevision) {
        return ApiResponse.ok(babyService.delete(DeviceContext.require(), babyId, baseRevision));
    }
}
