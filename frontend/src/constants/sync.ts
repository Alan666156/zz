/**
 * 批次幂等计划的 meta key（契约 §4.10 / §5.4）。
 * sync store 负责写入；删除宝宝等会改变批次内容的操作需要同步清理。
 */
export const SYNC_BATCH_PLAN_META_KEY = 'sync.batchPlan'
