package com.zz.babyfeeding.stats;

import com.zz.babyfeeding.baby.BabyMapper;
import com.zz.babyfeeding.common.api.BusinessException;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.common.redis.RedisCacheService;
import com.zz.babyfeeding.common.redis.RedisKeys;
import com.zz.babyfeeding.common.util.UuidUtils;
import com.zz.babyfeeding.common.web.DeviceContext;
import com.zz.babyfeeding.feeding.FeedingRecordEntity;
import com.zz.babyfeeding.feeding.FeedingRecordMapper;
import com.zz.babyfeeding.stats.dto.DailyStatsResponse;
import com.zz.babyfeeding.stats.dto.TrendPoint;
import com.zz.babyfeeding.stats.dto.TrendStatsResponse;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

/**
 * Statistics orchestration (contract 4.7, 2.4): validate query and ownership,
 * then serve a versioned Redis cache. Feeding writes INCR the version key, so
 * the next read misses the old cache; Redis failures degrade to DB reads.
 */
@Service
public class StatsService {

    private static final Duration CACHE_TTL = Duration.ofMinutes(10);

    private final FeedingRecordMapper feedingMapper;
    private final BabyMapper babyMapper;
    private final RedisCacheService redisCache;
    private final RedisKeys redisKeys;

    public StatsService(FeedingRecordMapper feedingMapper,
                        BabyMapper babyMapper,
                        RedisCacheService redisCache,
                        RedisKeys redisKeys) {
        this.feedingMapper = feedingMapper;
        this.babyMapper = babyMapper;
        this.redisCache = redisCache;
        this.redisKeys = redisKeys;
    }

    @Transactional(readOnly = true)
    public DailyStatsResponse daily(DeviceContext.Identity device,
                                    String babyIdRaw,
                                    String dateRaw) {
        String babyId = UuidUtils.requireUuidV4("babyId", babyIdRaw);
        LocalDate date = StatsValidator.parseRequiredDate("date", dateRaw);
        requireActiveBaby(device, babyId);

        long version = statsVersion(device, babyId);
        String cacheKey = redisKeys.statsDaily(device.hashHex(), babyId, version, date);
        Optional<DailyStatsResponse> cached =
                redisCache.get(cacheKey, DailyStatsResponse.class);
        if (cached.isPresent()) {
            return cached.get().withCached(true);
        }

        List<FeedingRecordEntity> rows = feedingMapper.listActiveInRange(
                device.deviceRowId(), babyId, date, date);
        DailyStatsResponse response = FeedingStatsAggregator.daily(babyId, date, rows);
        redisCache.put(cacheKey, response, CACHE_TTL);
        return response;
    }

    @Transactional(readOnly = true)
    public TrendStatsResponse trend(DeviceContext.Identity device,
                                    String babyIdRaw,
                                    String fromRaw,
                                    String toRaw) {
        String babyId = UuidUtils.requireUuidV4("babyId", babyIdRaw);
        LocalDate from = StatsValidator.parseRequiredDate("from", fromRaw);
        LocalDate to = StatsValidator.parseRequiredDate("to", toRaw);
        StatsValidator.validateTrendRange(from, to);
        requireActiveBaby(device, babyId);

        long version = statsVersion(device, babyId);
        String cacheKey = redisKeys.statsTrend(device.hashHex(), babyId, version, from, to);
        Optional<TrendStatsResponse> cached =
                redisCache.get(cacheKey, TrendStatsResponse.class);
        if (cached.isPresent()) {
            return cached.get().withCached(true);
        }

        List<FeedingRecordEntity> rows = feedingMapper.listActiveInRange(
                device.deviceRowId(), babyId, from, to);
        List<TrendPoint> points = FeedingStatsAggregator.trendPoints(from, to, rows);
        TrendStatsResponse response = new TrendStatsResponse(
                babyId, from, to, TrendStatsResponse.GRANULARITY_DAY, points, false);
        redisCache.put(cacheKey, response, CACHE_TTL);
        return response;
    }

    // ---------------------------------------------------------------- helpers

    private void requireActiveBaby(DeviceContext.Identity device, String babyId) {
        if (babyMapper.selectActiveById(babyId, device.deviceRowId()) == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND);
        }
    }

    private long statsVersion(DeviceContext.Identity device, String babyId) {
        return redisCache.currentVersion(
                redisKeys.statsVersion(device.hashHex(), babyId));
    }
}
