import { describe, expect, it } from 'vitest'
import {
  createCloudLiveCode,
  normalizeCloudLiveCode,
  selectCloudTarget,
  updateCloudLiveCode,
  type CloudLiveCode,
} from '../../functions/lib/liveCodeStore'

function createCode(overrides: Partial<CloudLiveCode> = {}): CloudLiveCode {
  return {
    id: 'id-1',
    name: '活动入口',
    code: 'ABC123',
    targetUrl: 'https://example.com/old',
    targetUrls: ['https://example.com/old'],
    enabled: true,
    visits: 5,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('cloud live codes', () => {
  it('creates an enabled code with a stable six-character key', () => {
    const code = createCloudLiveCode({ name: '新入口', targetUrls: ['https://example.com/new'] })

    expect(code.name).toBe('新入口')
    expect(code.targetUrl).toBe('https://example.com/new')
    expect(code.targetUrls).toEqual(['https://example.com/new'])
    expect(code.code).toMatch(/^[A-Z0-9]{6}$/)
    expect(code.enabled).toBe(true)
    expect(code.visits).toBe(0)
  })

  it('keeps the code and counters when updating the target', () => {
    const updated = updateCloudLiveCode(
      createCode(),
      { name: '新名称', targetUrls: ['https://example.com/new', 'https://example.com/backup'] },
      new Date('2026-07-22T01:00:00.000Z'),
    )

    expect(updated.code).toBe('ABC123')
    expect(updated.visits).toBe(5)
    expect(updated.targetUrl).toBe('https://example.com/new')
    expect(updated.targetUrls).toEqual(['https://example.com/new', 'https://example.com/backup'])
    expect(updated.updatedAt).toBe('2026-07-22T01:00:00.000Z')
  })

  it('rejects non-http target URLs', () => {
    expect(() => createCloudLiveCode({ name: '坏入口', targetUrls: ['javascript:alert(1)'] })).toThrow(
      '目标地址必须是 HTTP 或 HTTPS 链接',
    )
  })

  it('normalizes a legacy cloud record to a target list', () => {
    const legacy = { ...createCode() } as Partial<CloudLiveCode>
    delete legacy.targetUrls

    expect(normalizeCloudLiveCode(legacy)?.targetUrls).toEqual(['https://example.com/old'])
  })

  it('selects one configured target for a redirect', () => {
    const targets = ['https://example.com/a', 'https://example.com/b']

    expect(selectCloudTarget(targets, 0)).toBe(targets[0])
    expect(selectCloudTarget(targets, 0.99)).toBe(targets[1])
  })
})
