package com.zz.babyfeeding.feeding;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.PageResult;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.feeding.dto.CreateFeedingRecordRequest;
import com.zz.babyfeeding.feeding.dto.CreateFeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.DeleteFeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.FeedingRecordResponse;
import com.zz.babyfeeding.feeding.dto.PatchFeedingRecordRequest;
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
@RequestMapping("/api/v1/feeding-records")
public class FeedingController {

    private final FeedingService feedingService;

    public FeedingController(FeedingService feedingService) {
        this.feedingService = feedingService;
    }

    @PostMapping
    public ApiResponse<CreateFeedingRecordResponse> create(
            @RequestBody CreateFeedingRecordRequest request) {
        return ApiResponse.ok(feedingService.create(DeviceContext.require(), request));
    }

    @GetMapping
    public ApiResponse<PageResult<FeedingRecordResponse>> list(
            @RequestParam(required = false) String babyId,
            @RequestParam(required = false) String date,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String feedType,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return ApiResponse.ok(feedingService.list(DeviceContext.require(), babyId,
                date, from, to, feedType, page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<FeedingRecordResponse> get(@PathVariable String id) {
        return ApiResponse.ok(feedingService.get(DeviceContext.require(), id));
    }

    @PatchMapping("/{id}")
    public ApiResponse<FeedingRecordResponse> patch(
            @PathVariable String id,
            @RequestBody PatchFeedingRecordRequest request) {
        return ApiResponse.ok(feedingService.patch(DeviceContext.require(), id, request));
    }

    @DeleteMapping("/{id}")
    public ApiResponse<DeleteFeedingRecordResponse> delete(
            @PathVariable String id,
            @RequestParam(required = false) Integer baseRevision) {
        return ApiResponse.ok(feedingService.delete(DeviceContext.require(), id, baseRevision));
    }
}
