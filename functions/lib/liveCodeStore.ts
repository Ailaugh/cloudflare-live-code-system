export type CloudLiveCode = {
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

export type CloudLiveCodeDraft = {
  name: string
  targetUrls?: string[]
  targetUrl?: string
}

function normalizeDraft(draft: CloudLiveCodeDraft): { name: string; targetUrls: string[] } {
  const name = typeof draft.name === 'string' ? draft.name.trim() : ''
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

export function createCloudLiveCode(draft: CloudLiveCodeDraft, now = new Date()): CloudLiveCode {
  const normalized = normalizeDraft(draft)
  const id = crypto.randomUUID()
  const timestamp = now.toISOString()

  return {
    id,
    name: normalized.name,
    code: id.replaceAll('-', '').slice(0, 6).toUpperCase(),
    targetUrl: normalized.targetUrls[0],
    targetUrls: normalized.targetUrls,
    enabled: true,
    visits: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function updateCloudLiveCode(
  current: CloudLiveCode,
  draft: CloudLiveCodeDraft,
  now = new Date(),
): CloudLiveCode {
  const normalized = normalizeDraft(draft)

  return {
    ...current,
    name: normalized.name,
    targetUrl: normalized.targetUrls[0],
    targetUrls: normalized.targetUrls,
    updatedAt: now.toISOString(),
  }
}

export function normalizeCloudLiveCode(value: unknown): CloudLiveCode | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const item = value as Partial<CloudLiveCode> & { targetUrls?: unknown }
  if (!(
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.code === 'string' &&
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

  return { ...value as CloudLiveCode, targetUrl: targetUrls[0], targetUrls }
}

export function selectCloudTarget(targetUrls: string[], randomValue: number): string {
  if (targetUrls.length === 0) {
    throw new Error('至少需要一个目标地址')
  }

  const boundedRandom = Number.isFinite(randomValue)
    ? Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
    : 0
  return targetUrls[Math.floor(boundedRandom * targetUrls.length)]
}
