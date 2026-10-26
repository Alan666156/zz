import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { GrowthRecord, GrowthRecordInput, PageResult } from '@/types/models'

export interface GrowthListParams {
  babyId: string
  from?: string
  to?: string
  page?: number
  size?: number
}

export interface GrowthCreateResult {
  created: boolean
  record: GrowthRecord
}

export interface GrowthDeleteResult {
  id: string
  revision: number
  deletedAt: string
  alreadyDeleted: boolean
}

type GrowthMutationPayload = GrowthRecord | { record: GrowthRecord }

function unwrapRecord(payload: GrowthMutationPayload): GrowthRecord {
  if (payload && typeof payload === 'object' && 'record' in payload) {
    return (payload as { record: GrowthRecord }).record
  }
  return payload as GrowthRecord
}

export function listGrowthRecords(params: GrowthListParams): Promise<PageResult<GrowthRecord>> {
  return apiGet<PageResult<GrowthRecord>>('/growth-records', { ...params })
}

/** 无记录时契约返回 data:null（不是 404） */
export function fetchLatestGrowthRecord(babyId: string): Promise<GrowthRecord | null> {
  return apiGet<GrowthRecord | null>('/growth-records/latest', { babyId })
}

export function createGrowthRecordRequest(
  input: GrowthRecordInput & { id: string; babyId: string },
): Promise<GrowthCreateResult> {
  return apiPost<GrowthCreateResult>('/growth-records', input)
}

export async function patchGrowthRecordRequest(
  id: string,
  payload: Record<string, unknown>,
): Promise<GrowthRecord> {
  const data = await apiPatch<GrowthMutationPayload>(`/growth-records/${id}`, payload)
  return unwrapRecord(data)
}

export function deleteGrowthRecordRequest(
  id: string,
  baseRevision: number,
): Promise<GrowthDeleteResult> {
  return apiDelete<GrowthDeleteResult>(`/growth-records/${id}`, { baseRevision })
}
