package com.zz.babyfeeding.device;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface DeviceMapper extends BaseMapper<DeviceEntity> {

    /** Serialises per-device operations (baby limit, default transitions). */
    @Select("SELECT id FROM device WHERE id = #{id} FOR UPDATE")
    Long lockById(@Param("id") Long id);

    /** Resolves the device row from the HMAC digest carried by an export token. */
    @Select("SELECT id FROM device WHERE device_uid_hash = #{hash}")
    Long selectIdByHash(@Param("hash") byte[] hash);
}
