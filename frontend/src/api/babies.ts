import { apiDelete, apiGet, apiPatch, apiPost } from './client'
import type { Baby, BabyInput } from '@/types/models'

export interface BabyCreateResult {
  created: boolean
  baby: Baby
}

export interface BabyDeleteResult {
  id: string
  revision: number
  deletedAt: string
  cascadedFeedingRecords: number
  cascadedGrowthRecords: number
  alreadyDeleted: boolean
}

type BabyMutationPayload = Baby | { baby: Baby }

function unwrapBaby(payload: BabyMutationPayload): Baby {
  if (payload && typeof payload === 'object' && 'baby' in payload) {
    return (payload as { baby: Baby }).baby
  }
  return payload as Baby
}

export function fetchBabies(): Promise<Baby[]> {
  return apiGet<Baby[]>('/babies')
}

export function createBabyRequest(input: BabyInput & { id: string }): Promise<BabyCreateResult> {
  return apiPost<BabyCreateResult>('/babies', {
    id: input.id,
    name: input.name,
    gender: input.gender ?? 'UNKNOWN',
    birthDate: input.birthDate,
    isDefault: input.isDefault ?? false,
  })
}

export async function patchBabyRequest(
  id: string,
  payload: Record<string, unknown>,
): Promise<Baby> {
  const data = await apiPatch<BabyMutationPayload>(`/babies/${id}`, payload)
  return unwrapBaby(data)
}

export function deleteBabyRequest(id: string, baseRevision: number): Promise<BabyDeleteResult> {
  return apiDelete<BabyDeleteResult>(`/babies/${id}`, { baseRevision })
}
