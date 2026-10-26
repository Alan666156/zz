package com.zz.babyfeeding.sync.dto;

/** Counts per outcome; the four values sum to the number of changes. */
public record SyncSummary(int applied, int duplicate, int conflict, int rejected) {
}
