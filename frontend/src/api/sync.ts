import { apiPost } from './client'
import type { SyncEntityType, SyncOp } from '@/types/models'

export interface SyncChange {
  entityType: SyncEntityType
  op: SyncOp
  id: string
  baseRevision: number
  data?: Record<string, unknown>
}

export interface SyncPushRequest {
  batchId: string
  clientTime: string
  changes: SyncChange[]
}

export type SyncResultStatus = 'APPLIED' | 'DUPLICATE' | 'CONFLICT_SERVER_WINS' | 'REJECTED'

export interface SyncRecordError {
  code: string
  message: string
}

export interface SyncPushResult {
  entityType: SyncEntityType
  id: string
  status: SyncResultStatus
  revision: number
  /** 仅 sync 入口可能返回 tombstone（deletedAt 非空） */
  record?: Record<string, unknown> | null
  error?: SyncRecordError | null
}

export interface SyncPushSummary {
  applied: number
  duplicate: number
  conflict: number
  rejected: number
}

export interface SyncPushResponse {
  batchId: string
  replayed: boolean
  processedAt: string
  results: SyncPushResult[]
  summary: SyncPushSummary
}

/** POST /api/v1/sync/push（契约 §4.10；changes 1-50 条） */
export function pushSyncBatch(payload: SyncPushRequest): Promise<SyncPushResponse> {
  return apiPost<SyncPushResponse>('/sync/push', payload)
}
