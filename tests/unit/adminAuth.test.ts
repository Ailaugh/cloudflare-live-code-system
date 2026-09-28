import { describe, expect, it } from 'vitest'
import {
  ADMIN_PATH,
  clearAdminToken,
  getStoredAdminToken,
  rememberAdminToken,
  isAdminPath,
  type TokenStorage,
} from '../../src/lib/adminAuth'

function createStorage(): TokenStorage {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

describe('admin auth', () => {
  it('recognizes only the protected admin path', () => {
    expect(isAdminPath(ADMIN_PATH)).toBe(true)
    expect(isAdminPath(`${ADMIN_PATH}/`)).toBe(true)
    expect(isAdminPath('/')).toBe(false)
    expect(isAdminPath('/go/ABC123')).toBe(false)
    expect(isAdminPath('/tk/admin/extra')).toBe(false)
  })

  it('prefers a current-session token over a remembered token', () => {
    const session = createStorage()
    const local = createStorage()
    rememberAdminToken('remembered', false, session, local)
    rememberAdminToken('session', true, session, local)

    expect(getStoredAdminToken(session, local)).toBe('session')
  })

  it('clears both token stores on logout', () => {
    const session = createStorage()
    const local = createStorage()
    rememberAdminToken('secret', true, session, local)

    clearAdminToken(session, local)

    expect(getStoredAdminToken(session, local)).toBe('')
  })
})
