package com.zz.babyfeeding.feeding;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface FeedingRecordMapper extends BaseMapper<FeedingRecordEntity> {

    /** Includes tombstones; callers must verify device ownership. */
    @Select("SELECT * FROM feeding_record WHERE id = #{id} LIMIT 1")
    FeedingRecordEntity selectAnyById(@Param("id") String id);

    @Select("""
            SELECT * FROM feeding_record
            WHERE id = #{id} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    FeedingRecordEntity selectActiveById(@Param("id") String id,
                                         @Param("deviceId") Long deviceId);

    @Select("""
            <script>
            SELECT * FROM feeding_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
              AND record_date BETWEEN #{from} AND #{to}
            <if test="feedType != null">
              AND feed_type = #{feedType}
            </if>
            ORDER BY started_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<FeedingRecordEntity> listPage(@Param("deviceId") Long deviceId,
                                       @Param("babyId") String babyId,
                                       @Param("from") LocalDate from,
                                       @Param("to") LocalDate to,
                                       @Param("feedType") String feedType,
                                       @Param("offset") long offset,
                                       @Param("limit") int limit);

    @Select("""
            <script>
            SELECT COUNT(*) FROM feeding_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
              AND record_date BETWEEN #{from} AND #{to}
            <if test="feedType != null">
              AND feed_type = #{feedType}
            </if>
            </script>
            """)
    long countPage(@Param("deviceId") Long deviceId,
                   @Param("babyId") String babyId,
                   @Param("from") LocalDate from,
                   @Param("to") LocalDate to,
                   @Param("feedType") String feedType);

    /** All active records in a local-date range, used by statistics. */
    @Select("""
            SELECT * FROM feeding_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
              AND record_date BETWEEN #{from} AND #{to}
            ORDER BY started_at ASC, id ASC
            """)
    List<FeedingRecordEntity> listActiveInRange(@Param("deviceId") Long deviceId,
                                                @Param("babyId") String babyId,
                                                @Param("from") LocalDate from,
                                                @Param("to") LocalDate to);

    /** Active records for one local date, used by the CSV export. */
    @Select("""
            SELECT * FROM feeding_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
              AND record_date BETWEEN #{from} AND #{to}
            ORDER BY started_at ASC, id ASC
            """)
    List<FeedingRecordEntity> listForExport(@Param("deviceId") Long deviceId,
                                            @Param("babyId") String babyId,
                                            @Param("from") LocalDate from,
                                            @Param("to") LocalDate to);
}
