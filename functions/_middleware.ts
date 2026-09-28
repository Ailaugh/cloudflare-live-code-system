import type { PagesFunction } from '@cloudflare/workers-types'

export const onRequest: PagesFunction = async (context) => {
  if (new URL(context.request.url).pathname === '/') {
    return new Response('Not Found', {
      status: 404,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  }

  return context.next()
}
