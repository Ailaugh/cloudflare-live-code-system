import { describe, expect, it } from 'vitest'
import {
  buildLiveCodeUrl,
  createLiveCode,
  loadLiveCodes,
  recordVisit,
  resolveLiveCode,
  saveLiveCodes,
  selectRandomTarget,
  updateLiveCode,
  type LiveCode,
  type StorageLike,
} from '../../src/lib/liveCodes'

function createStorage(): StorageLike {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

function createCode(overrides: Partial<LiveCode> = {}): LiveCode {
  return {
    id: 'code-1',
    name: '活动入口',
    code: 'ABC123',
    targetUrl: 'https://example.com/old',
    targetUrls: ['https://example.com/old'],
    enabled: true,
    visits: 4,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('live codes', () => {
  it('keeps the short code and visit count when the target is edited', () => {
    const original = createCode()
    const updated = updateLiveCode(original, {
      name: '新活动入口',
      targetUrl: 'https://example.com/new',
    }, new Date('2026-07-22T01:00:00.000Z'))

    expect(updated.code).toBe(original.code)
    expect(updated.id).toBe(original.id)
    expect(updated.visits).toBe(original.visits)
    expect(updated.targetUrl).toBe('https://example.com/new')
    expect(updated.targetUrls).toEqual(['https://example.com/new'])
    expect(updated.updatedAt).toBe('2026-07-22T01:00:00.000Z')
  })

  it('creates and updates a code with multiple target URLs', () => {
    const created = createLiveCode({
      name: '随机入口',
      targetUrls: ['https://example.com/a', 'https://example.com/b'],
    }, new Date('2026-07-22T00:30:00.000Z'))
    const updated = updateLiveCode(created, {
      name: '随机入口',
      targetUrls: ['https://example.com/c', 'https://example.com/d'],
    })

    expect(created.targetUrl).toBe('https://example.com/a')
    expect(created.targetUrls).toEqual(['https://example.com/a', 'https://example.com/b'])
    expect(updated.targetUrl).toBe('https://example.com/c')
    expect(updated.targetUrls).toEqual(['https://example.com/c', 'https://example.com/d'])
  })

  it('selects a target from the configured list', () => {
    const targets = ['https://example.com/a', 'https://example.com/b']

    expect(selectRandomTarget(targets, 0)).toBe(targets[0])
    expect(selectRandomTarget(targets, 0.99)).toBe(targets[1])
  })

  it('rejects non-http target URLs', () => {
    expect(() => createLiveCode({ name: '坏地址', targetUrl: 'javascript:alert(1)' })).toThrow(
      '目标地址必须是 HTTP 或 HTTPS 链接',
    )
  })

  it('does not resolve a disabled code', () => {
    expect(resolveLiveCode([createCode({ enabled: false })], 'ABC123')).toBeNull()
    expect(resolveLiveCode([createCode()], 'MISSING')).toBeNull()
    expect(resolveLiveCode([createCode()], 'ABC123')?.targetUrl).toBe('https://example.com/old')
  })

  it('increments only the matching code visit count', () => {
    const codes = [createCode(), createCode({ id: 'code-2', code: 'XYZ789', visits: 1 })]
    const next = recordVisit(codes, 'ABC123')

    expect(next[0].visits).toBe(5)
    expect(next[1].visits).toBe(1)
    expect(codes[0].visits).toBe(4)
  })

  it('persists and restores valid live codes', () => {
    const storage = createStorage()
    const codes = [createCode()]

    saveLiveCodes(storage, codes)

    expect(loadLiveCodes(storage)).toEqual(codes)
  })

  it('adds a target list when restoring legacy single-target data', () => {
    const storage = createStorage()
    const legacy = { ...createCode() } as Partial<LiveCode>
    delete legacy.targetUrls
    storage.setItem('live-code-system.codes.v1', JSON.stringify([legacy]))

    expect(loadLiveCodes(storage)[0].targetUrls).toEqual(['https://example.com/old'])
  })

  it('builds a stable hash URL for a short code', () => {
    expect(buildLiveCodeUrl('ABC123', { origin: 'http://localhost:5173', pathname: '/' })).toBe(
      'http://localhost:5173/go/ABC123',
    )
  })
})
