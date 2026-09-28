import type { PagesFunction } from '@cloudflare/workers-types'
import {
  createCloudLiveCode,
  normalizeCloudLiveCode,
  updateCloudLiveCode,
  type CloudLiveCode,
  type CloudLiveCodeDraft,
} from '../lib/liveCodeStore'
import type { CloudflareEnv } from '../lib/env'

const INDEX_KEY = 'live-code:index'
const ITEM_PREFIX = 'live-code:item:'

function itemKey(code: string): string {
  return `${ITEM_PREFIX}${code.toUpperCase()}`
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

function checkAdmin(request: Request, env: CloudflareEnv): Response | null {
  if (!env.ADMIN_TOKEN) {
    return json({ error: 'ADMIN_TOKEN 未配置' }, 500)
  }

  if (request.headers.get('x-admin-token') !== env.ADMIN_TOKEN) {
    return json({ error: '管理口令错误' }, 401)
  }

  return null
}

async function readIndex(env: CloudflareEnv): Promise<CloudLiveCode[]> {
  const stored = await env.LIVE_CODES.get(INDEX_KEY, 'json') as unknown
  return Array.isArray(stored)
    ? stored.map(normalizeCloudLiveCode).filter((item): item is CloudLiveCode => item !== null)
    : []
}

async function writeIndex(env: CloudflareEnv, codes: CloudLiveCode[]): Promise<void> {
  await env.LIVE_CODES.put(INDEX_KEY, JSON.stringify(codes))
}

async function writeCode(env: CloudflareEnv, code: CloudLiveCode): Promise<void> {
  await env.LIVE_CODES.put(itemKey(code.code), JSON.stringify(code))
}

async function parseBody(request: Request): Promise<CloudLiveCodeDraft & { enabled?: boolean }> {
  const body = await request.json() as Partial<CloudLiveCodeDraft> & { enabled?: boolean }
  const targetUrls = Array.isArray(body.targetUrls) ? body.targetUrls : [body.targetUrl ?? '']
  return {
    name: body.name ?? '',
    targetUrls,
    ...(typeof body.enabled === 'boolean' ? { enabled: body.enabled } : {}),
  }
}

export const onRequestGet: PagesFunction<CloudflareEnv> = async ({ request, env }) => {
  const unauthorized = checkAdmin(request, env)
  if (unauthorized) {
    return unauthorized
  }

  return json(await readIndex(env))
}

export const onRequestPost: PagesFunction<CloudflareEnv> = async ({ request, env }) => {
  const unauthorized = checkAdmin(request, env)
  if (unauthorized) {
    return unauthorized
  }

  try {
    const draft = await parseBody(request)
    const codes = await readIndex(env)
    let created = createCloudLiveCode(draft)
    while (codes.some((item) => item.code === created.code)) {
      created = createCloudLiveCode(draft)
    }

    await Promise.all([writeCode(env, created), writeIndex(env, [created, ...codes])])
    return json(created, 201)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '创建失败' }, 400)
  }
}

export const onRequestPut: PagesFunction<CloudflareEnv> = async ({ request, env }) => {
  const unauthorized = checkAdmin(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) {
    return json({ error: '缺少 code' }, 400)
  }

  try {
    const codes = await readIndex(env)
    const current = codes.find((item) => item.code === code)
    if (!current) {
      return json({ error: '活码不存在' }, 404)
    }

    const body = await parseBody(request)
    const updated = updateCloudLiveCode(current, body)
    const next = { ...updated, enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled }
    await Promise.all([
      writeCode(env, next),
      writeIndex(env, codes.map((item) => item.code === code ? next : item)),
    ])
    return json(next)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : '保存失败' }, 400)
  }
}

export const onRequestDelete: PagesFunction<CloudflareEnv> = async ({ request, env }) => {
  const unauthorized = checkAdmin(request, env)
  if (unauthorized) {
    return unauthorized
  }

  const code = new URL(request.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) {
    return json({ error: '缺少 code' }, 400)
  }

  const codes = await readIndex(env)
  if (!codes.some((item) => item.code === code)) {
    return json({ error: '活码不存在' }, 404)
  }

  await Promise.all([
    env.LIVE_CODES.delete(itemKey(code)),
    writeIndex(env, codes.filter((item) => item.code !== code)),
  ])
  return json({ ok: true })
}
