package com.zz.babyfeeding.common.api;

import java.util.List;

/** Pagination contract (section 4.3). */
public record PageResult<T>(
        List<T> items,
        int page,
        int size,
        long total,
        boolean hasNext
) {

    public static <T> PageResult<T> of(List<T> items, int page, int size, long total) {
        long consumed = (long) page * size;
        return new PageResult<>(items, page, size, total, consumed < total);
    }
}
