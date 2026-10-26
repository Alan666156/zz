package com.zz.babyfeeding.baby;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface BabyMapper extends BaseMapper<BabyEntity> {

    /** Includes tombstones; callers must verify device ownership. */
    @Select("SELECT * FROM baby WHERE id = #{id} LIMIT 1")
    BabyEntity selectAnyById(@Param("id") String id);

    @Select("""
            SELECT * FROM baby
            WHERE id = #{id} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    BabyEntity selectActiveById(@Param("id") String id, @Param("deviceId") Long deviceId);

    @Select("""
            SELECT * FROM baby
            WHERE device_id = #{deviceId} AND deleted_at IS NULL
            ORDER BY is_default DESC, created_at ASC, id ASC
            """)
    List<BabyEntity> listActiveByDevice(@Param("deviceId") Long deviceId);

    @Select("""
            SELECT COUNT(*) FROM baby
            WHERE device_id = #{deviceId} AND deleted_at IS NULL
            """)
    int countActiveByDevice(@Param("deviceId") Long deviceId);

    @Select("""
            SELECT * FROM baby
            WHERE device_id = #{deviceId} AND deleted_at IS NULL AND id <> #{exceptId}
            ORDER BY created_at ASC, id ASC
            LIMIT 1
            """)
    BabyEntity selectEarliestActiveExcluding(@Param("deviceId") Long deviceId,
                                             @Param("exceptId") String exceptId);

    @Update("""
            UPDATE baby
            SET is_default = 0, revision = revision + 1, updated_at = #{now}
            WHERE device_id = #{deviceId} AND deleted_at IS NULL
              AND is_default = 1 AND id <> #{exceptId}
            """)
    int clearDefaultForDevice(@Param("deviceId") Long deviceId,
                              @Param("exceptId") String exceptId,
                              @Param("now") LocalDateTime now);

    @Update("""
            UPDATE baby
            SET is_default = 1, revision = revision + 1, updated_at = #{now}
            WHERE id = #{id} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    int markDefault(@Param("id") String id,
                    @Param("deviceId") Long deviceId,
                    @Param("now") LocalDateTime now);

    @Update("""
            UPDATE feeding_record
            SET deleted_at = #{now}, revision = revision + 1, updated_at = #{now}
            WHERE baby_id = #{babyId} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    int softDeleteFeedingRecords(@Param("babyId") String babyId,
                                 @Param("deviceId") Long deviceId,
                                 @Param("now") LocalDateTime now);

    @Update("""
            UPDATE growth_record
            SET deleted_at = #{now}, revision = revision + 1, updated_at = #{now}
            WHERE baby_id = #{babyId} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    int softDeleteGrowthRecords(@Param("babyId") String babyId,
                                @Param("deviceId") Long deviceId,
                                @Param("now") LocalDateTime now);
}
