export type LiveCode = {
  id: string
  name: string
  code: string
  targetUrl: string
  targetUrls: string[]
  enabled: boolean
  visits: number
  createdAt: string
  updatedAt: string
}

export type LiveCodeDraft = {
  name: string
  targetUrls?: string[]
  targetUrl?: string
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const LIVE_CODES_STORAGE_KEY = 'live-code-system.codes.v1'

function getBrowserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizeDraft(draft: LiveCodeDraft): { name: string; targetUrls: string[] } {
  const name = draft.name.trim()
  const rawTargets = Array.isArray(draft.targetUrls) ? draft.targetUrls : [draft.targetUrl ?? '']
  const targetUrls = rawTargets
    .filter((target): target is string => typeof target === 'string')
    .map((target) => target.trim())
    .filter(Boolean)

  if (!name) {
    throw new Error('活码名称不能为空')
  }

  if (targetUrls.length === 0) {
    throw new Error('至少需要一个目标地址')
  }

  for (const targetUrl of targetUrls) {
    try {
      const url = new URL(targetUrl)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error()
      }
    } catch {
      throw new Error('目标地址必须是 HTTP 或 HTTPS 链接')
    }
  }

  return { name, targetUrls }
}

function createShortCode(id: string): string {
  return id.replaceAll('-', '').slice(0, 6).toUpperCase()
}

export function createLiveCode(draft: LiveCodeDraft, now = new Date()): LiveCode {
  const normalized = normalizeDraft(draft)
  const id = createId()
  const timestamp = now.toISOString()

  return {
    id,
    name: normalized.name,
    code: createShortCode(id),
    targetUrl: normalized.targetUrls[0],
    targetUrls: normalized.targetUrls,
    enabled: true,
    visits: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function updateLiveCode(
  current: LiveCode,
  draft: LiveCodeDraft,
  now = new Date(),
): LiveCode {
  const normalized = normalizeDraft(draft)

  return {
    ...current,
    targetUrl: normalized.targetUrls[0],
    targetUrls: normalized.targetUrls,
    name: normalized.name,
    updatedAt: now.toISOString(),
  }
}

export function recordVisit(codes: LiveCode[], code: string): LiveCode[] {
  const normalizedCode = code.trim().toUpperCase()
  return codes.map((item) => {
    if (item.code !== normalizedCode || !item.enabled) {
      return item
    }

    return { ...item, visits: item.visits + 1 }
  })
}

export function resolveLiveCode(codes: LiveCode[], code: string): LiveCode | null {
  const normalizedCode = code.trim().toUpperCase()
  return codes.find((item) => item.code === normalizedCode && item.enabled) ?? null
}

export function selectRandomTarget(targetUrls: string[], randomValue = Math.random()): string {
  if (targetUrls.length === 0) {
    throw new Error('至少需要一个目标地址')
  }

  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0
  return targetUrls[Math.floor(boundedRandom * targetUrls.length)]
}

export function buildLiveCodeUrl(
  code: string,
  location: Pick<Location, 'origin' | 'pathname'> = window.location,
): string {
  return `${location.origin}/go/${encodeURIComponent(code)}`
}

function normalizeStoredLiveCode(value: unknown): LiveCode | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Partial<LiveCode> & { targetUrls?: unknown }
  if (!(
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.code === 'string' &&
    typeof item.targetUrl === 'string' &&
    (item.enabled === true || item.enabled === false) &&
    typeof item.visits === 'number' &&
    typeof item.createdAt === 'string' &&
    typeof item.updatedAt === 'string'
  )) {
    return null
  }

  const rawTargets = Array.isArray(item.targetUrls) && item.targetUrls.length > 0
    ? item.targetUrls
    : [item.targetUrl]
  const targetUrls = rawTargets
    .filter((target): target is string => typeof target === 'string')
    .map((target) => target.trim())
    .filter(Boolean)
  if (targetUrls.length === 0) {
    return null
  }

  return { ...value as LiveCode, targetUrl: targetUrls[0], targetUrls }
}

export function loadLiveCodes(storage: StorageLike | null = getBrowserStorage()): LiveCode[] {
  if (!storage) {
    return []
  }

  try {
    const raw = storage.getItem(LIVE_CODES_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredLiveCode).filter((item): item is LiveCode => item !== null)
      : []
  } catch {
    return []
  }
}

export function saveLiveCodes(storage: StorageLike | null, codes: LiveCode[]): void {
  storage?.setItem(LIVE_CODES_STORAGE_KEY, JSON.stringify(codes))
}
