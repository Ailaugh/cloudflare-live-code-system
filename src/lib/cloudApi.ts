import type { LiveCode, LiveCodeDraft } from './liveCodes'

export const ADMIN_TOKEN_STORAGE_KEY = 'live-code-system.admin-token'

type ApiError = {
  error?: string
}

async function request<T>(token: string, init: RequestInit = {}, query = ''): Promise<T> {
  const response = await fetch(`/api/codes${query}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-admin-token': token,
      ...init.headers,
    },
  })

  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as ApiError).error
      : undefined
    throw new Error(message || `请求失败（${response.status}）`)
  }

  return payload as T
}

export function listCloudLiveCodes(token: string): Promise<LiveCode[]> {
  return request<LiveCode[]>(token)
}

export function createCloudLiveCode(token: string, draft: LiveCodeDraft): Promise<LiveCode> {
  return request<LiveCode>(token, {
    method: 'POST',
    body: JSON.stringify(draft),
  })
}

export function updateCloudLiveCode(
  token: string,
  code: string,
  payload: LiveCodeDraft & { enabled?: boolean },
): Promise<LiveCode> {
  return request<LiveCode>(token, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, `?code=${encodeURIComponent(code)}`)
}

export function deleteCloudLiveCode(token: string, code: string): Promise<void> {
  return request<void>(token, {
    method: 'DELETE',
  }, `?code=${encodeURIComponent(code)}`)
}
