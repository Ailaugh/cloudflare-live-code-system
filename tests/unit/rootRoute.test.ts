import { describe, expect, it } from 'vitest'
import { onRequest } from '../../functions/_middleware'

describe('root route', () => {
  it('does not expose a homepage', async () => {
    const response = await onRequest({
      request: new Request('https://example.com/'),
      env: {},
    } as Parameters<typeof onRequest>[0])

    expect(response.status).toBe(404)
  })
})
