import type { KVNamespace } from '@cloudflare/workers-types'

export type CloudflareEnv = {
  LIVE_CODES: KVNamespace
  ADMIN_TOKEN: string
}
