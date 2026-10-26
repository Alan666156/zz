package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.stats.dto.DailyStatsResponse;
import com.zz.babyfeeding.stats.dto.TrendStatsResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/stats")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    @GetMapping("/daily")
    public ApiResponse<DailyStatsResponse> daily(
            @RequestParam(required = false) String babyId,
            @RequestParam(required = false) String date) {
        return ApiResponse.ok(statsService.daily(DeviceContext.require(), babyId, date));
    }

    @GetMapping("/trend")
    public ApiResponse<TrendStatsResponse> trend(
            @RequestParam(required = false) String babyId,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {
        return ApiResponse.ok(statsService.trend(DeviceContext.require(), babyId, from, to));
    }
}
