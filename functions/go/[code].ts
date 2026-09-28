import type { PagesFunction } from '@cloudflare/workers-types'
import {
  normalizeCloudLiveCode,
  selectCloudTarget,
  type CloudLiveCode,
} from '../lib/liveCodeStore'
import type { CloudflareEnv } from '../lib/env'

const ITEM_PREFIX = 'live-code:item:'
const INDEX_KEY = 'live-code:index'

function itemKey(code: string): string {
  return `${ITEM_PREFIX}${code.toUpperCase()}`
}

function unavailable(message: string): Response {
  return new Response(message, {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function randomValue(): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0] / 0x100000000
}

export const onRequestGet: PagesFunction<CloudflareEnv> = async ({ params, env, waitUntil }) => {
  const code = String(params.code ?? '').trim().toUpperCase()
  if (!code) {
    return unavailable('活码不存在')
  }

  const stored = await env.LIVE_CODES.get(itemKey(code), 'json') as unknown
  const liveCode = normalizeCloudLiveCode(stored) as CloudLiveCode | null
  if (!liveCode) {
    return unavailable('活码不存在')
  }

  if (!liveCode.enabled) {
    return unavailable('活码已停用')
  }

  const targetUrl = selectCloudTarget(liveCode.targetUrls, randomValue())

  waitUntil((async () => {
    const next = { ...liveCode, visits: liveCode.visits + 1 }
    const index = await env.LIVE_CODES.get(INDEX_KEY, 'json') as CloudLiveCode[] | null
    await Promise.all([
      env.LIVE_CODES.put(itemKey(code), JSON.stringify(next)),
      index
        ? env.LIVE_CODES.put(INDEX_KEY, JSON.stringify(index.map((item) => item.code === code ? next : item)))
        : Promise.resolve(),
    ])
  })())

  return new Response(null, {
    status: 302,
    headers: {
      location: targetUrl,
      'cache-control': 'no-store',
    },
  })
}
