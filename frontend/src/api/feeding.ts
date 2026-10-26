import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { FeedingRecord, FeedingRecordInput, FeedingType, PageResult } from '@/types/models'

export interface FeedingListParams {
  babyId: string
  date?: string
  from?: string
  to?: string
  feedType?: FeedingType
  page?: number
  size?: number
}

export interface FeedingCreateResult {
  created: boolean
  record: FeedingRecord
}

export interface FeedingDeleteResult {
  id: string
  revision: number
  deletedAt: string
  alreadyDeleted: boolean
}

type FeedingMutationPayload = FeedingRecord | { record: FeedingRecord }

function unwrapRecord(payload: FeedingMutationPayload): FeedingRecord {
  if (payload && typeof payload === 'object' && 'record' in payload) {
    return (payload as { record: FeedingRecord }).record
  }
  return payload as FeedingRecord
}

export function listFeedingRecords(params: FeedingListParams): Promise<PageResult<FeedingRecord>> {
  return apiGet<PageResult<FeedingRecord>>('/feeding-records', { ...params })
}

export function createFeedingRecordRequest(
  input: FeedingRecordInput & { id: string; babyId: string },
): Promise<FeedingCreateResult> {
  return apiPost<FeedingCreateResult>('/feeding-records', input)
}

export async function patchFeedingRecordRequest(
  id: string,
  payload: Record<string, unknown>,
): Promise<FeedingRecord> {
  const data = await apiPatch<FeedingMutationPayload>(`/feeding-records/${id}`, payload)
  return unwrapRecord(data)
}

export function deleteFeedingRecordRequest(
  id: string,
  baseRevision: number,
): Promise<FeedingDeleteResult> {
  return apiDelete<FeedingDeleteResult>(`/feeding-records/${id}`, { baseRevision })
}
