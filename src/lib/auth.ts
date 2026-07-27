/* ── Client-only session gate: no backend/DB, credentials are hardcoded and
 *    the "session" is just a sessionStorage flag (cleared when the tab closes). ── */

const AUTH_KEY = 'prism_auth';
const VALID_USERNAME = 'Admin';
const VALID_PASSWORD = '123';

export function checkCredentials(username: string, password: string): boolean {
  return username === VALID_USERNAME && password === VALID_PASSWORD;
}

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(AUTH_KEY) === 'true';
}

export function login(): void {
  sessionStorage.setItem(AUTH_KEY, 'true');
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_KEY);
}
