package com.zz.babyfeeding.growth;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface GrowthRecordMapper extends BaseMapper<GrowthRecordEntity> {

    /** Includes tombstones; callers must verify device ownership. */
    @Select("SELECT * FROM growth_record WHERE id = #{id} LIMIT 1")
    GrowthRecordEntity selectAnyById(@Param("id") String id);

    @Select("""
            SELECT * FROM growth_record
            WHERE id = #{id} AND device_id = #{deviceId} AND deleted_at IS NULL
            """)
    GrowthRecordEntity selectActiveById(@Param("id") String id,
                                        @Param("deviceId") Long deviceId);

    @Select("""
            <script>
            SELECT * FROM growth_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
            <if test="from != null">
              AND measured_on &gt;= #{from}
            </if>
            <if test="to != null">
              AND measured_on &lt;= #{to}
            </if>
            ORDER BY measured_on DESC, created_at DESC, id DESC
            LIMIT #{limit} OFFSET #{offset}
            </script>
            """)
    List<GrowthRecordEntity> listPage(@Param("deviceId") Long deviceId,
                                      @Param("babyId") String babyId,
                                      @Param("from") LocalDate from,
                                      @Param("to") LocalDate to,
                                      @Param("offset") long offset,
                                      @Param("limit") int limit);

    @Select("""
            <script>
            SELECT COUNT(*) FROM growth_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
            <if test="from != null">
              AND measured_on &gt;= #{from}
            </if>
            <if test="to != null">
              AND measured_on &lt;= #{to}
            </if>
            </script>
            """)
    long countPage(@Param("deviceId") Long deviceId,
                   @Param("babyId") String babyId,
                   @Param("from") LocalDate from,
                   @Param("to") LocalDate to);

    @Select("""
            SELECT * FROM growth_record
            WHERE device_id = #{deviceId} AND baby_id = #{babyId}
              AND deleted_at IS NULL
            ORDER BY measured_on DESC, created_at DESC, id DESC
            LIMIT 1
            """)
    GrowthRecordEntity selectLatest(@Param("deviceId") Long deviceId,
                                    @Param("babyId") String babyId);
}
