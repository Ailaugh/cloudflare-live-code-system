export const ADMIN_PATH = '/tk/admin'
export const ADMIN_TOKEN_STORAGE_KEY = 'live-code-system.admin-token'

export type TokenStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_PATH || pathname === `${ADMIN_PATH}/`
}

export function getStoredAdminToken(
  sessionStorage: TokenStorage | null,
  localStorage: TokenStorage | null,
): string {
  return sessionStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim()
    || localStorage?.getItem(ADMIN_TOKEN_STORAGE_KEY)?.trim()
    || ''
}

export function rememberAdminToken(
  token: string,
  remember: boolean,
  sessionStorage: TokenStorage | null,
  localStorage: TokenStorage | null,
): void {
  sessionStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  if (remember) {
    localStorage?.setItem(ADMIN_TOKEN_STORAGE_KEY, token)
  } else {
    localStorage?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  }
}

export function clearAdminToken(
  sessionStorage: TokenStorage | null,
  localStorage: TokenStorage | null,
): void {
  sessionStorage?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  localStorage?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
}
