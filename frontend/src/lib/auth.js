// Auth client.
//  - Normal mode: talks to the BrandLens API (/api/auth/*), passwords hashed on the server.
//  - Offline mode: if the API cannot be reached, an account is kept ONLY in this browser
//    (PBKDF2-hashed with WebCrypto). It is clearly labelled in the UI.
import { API_URL } from './api'

const SESSION_KEY = 'brandlens-session'
const LOCAL_USERS = 'brandlens-local-users'
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export class AuthError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}
class NetworkError extends Error {}

export const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'U'

/* ---------- session storage ---------- */
export function loadSession() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
  }
  return null
}
export function saveSession(session, remember = true) {
  clearSession()
  try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(session)) } catch { /* ignore */ }
}
export function clearSession() {
  for (const store of [localStorage, sessionStorage]) {
    try { store.removeItem(SESSION_KEY) } catch { /* ignore */ }
  }
}
// keep the stored session in sync when the user edits their profile
function updateStoredUser(user) {
  for (const store of [localStorage, sessionStorage]) {
    try {
      const raw = store.getItem(SESSION_KEY)
      if (raw) store.setItem(SESSION_KEY, JSON.stringify({ ...JSON.parse(raw), user }))
    } catch { /* ignore */ }
  }
}

/* ---------- API helper ---------- */
async function api(path, { method = 'GET', body, token } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25000),
    })
  } catch {
    throw new NetworkError('API unreachable')
  }
  let data = null
  try { data = await res.json() } catch { /* empty */ }
  if (!res.ok) {
    if (res.status >= 500) throw new NetworkError('API error')
    const detail = Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join(', ') : data?.detail
    throw new AuthError(detail || 'Something went wrong.', res.status)
  }
  return data
}

/* ---------- local (offline) accounts ---------- */
const b64 = (bytes) => btoa(String.fromCharCode(...bytes))
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function pbkdf2(password, saltB64) {
  if (!globalThis.crypto?.subtle) throw new AuthError('Offline accounts need a secure (https) connection.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: unb64(saltB64), iterations: 150000, hash: 'SHA-256' }, key, 256)
  return b64(new Uint8Array(bits))
}
const readUsers = () => { try { return JSON.parse(localStorage.getItem(LOCAL_USERS)) || [] } catch { return [] } }
const writeUsers = (u) => localStorage.setItem(LOCAL_USERS, JSON.stringify(u))
const publicLocal = ({ pw_hash, salt, ...rest }) => rest // eslint-disable-line no-unused-vars

async function localRegister(form) {
  const users = readUsers()
  const email = form.email.trim().toLowerCase()
  if (users.some((u) => u.email === email)) throw new AuthError('An account with this email already exists.', 409)
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  const user = {
    id: `local-${crypto.randomUUID?.() || Date.now()}`,
    email, account_type: form.account_type, full_name: form.full_name.trim(), phone: '',
    org_name: form.org_name || '', org_email: form.org_email || '', work_email: form.work_email || '',
    industry: form.industry || '', team_size: form.team_size || '',
    created_at: Math.floor(Date.now() / 1000), last_login: null,
    salt, pw_hash: await pbkdf2(form.password, salt),
  }
  writeUsers([...users, user])
  return publicLocal(user)
}
async function localLogin(email, password) {
  const users = readUsers()
  const idx = users.findIndex((u) => u.email === email.trim().toLowerCase())
  if (idx < 0 || (await pbkdf2(password, users[idx].salt)) !== users[idx].pw_hash) throw new AuthError('Invalid email or password.', 401)
  users[idx].last_login = Math.floor(Date.now() / 1000)
  writeUsers(users)
  return publicLocal(users[idx])
}

/* ---------- validation (same rules as the server) ---------- */
export function validateSignup(f) {
  if (!f.email.trim() || !EMAIL_RE.test(f.email.trim())) return 'Please enter a valid email address.'
  if (!f.password) return 'Please enter your password.'
  if (!f.full_name.trim()) return 'Please enter your full name.'
  if (f.account_type === 'organization') {
    if (!f.org_name.trim() || !f.org_email.trim() || !f.work_email.trim()) return 'Please complete organization name, organization email, and admin work email.'
    if (!EMAIL_RE.test(f.org_email.trim()) || !EMAIL_RE.test(f.work_email.trim())) return 'Please enter valid organization and work emails.'
  }
  if (f.password.length < 8) return 'Use a password with at least 8 characters.'
  if (f.password !== f.confirm) return 'Passwords do not match.'
  if (!f.terms) return 'Please accept the Terms of Service and Privacy Policy.'
  return ''
}

/* ---------- public operations ---------- */
export async function login(email, password, remember) {
  let session
  try {
    const { user, token } = await api('/api/auth/login', { method: 'POST', body: { email, password, remember } })
    session = { mode: 'api', token, user }
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e
    const user = await localLogin(email, password)
    session = { mode: 'local', token: user.id, user }
  }
  saveSession(session, remember)
  return session
}

export async function signup(form, remember = true) {
  const body = {
    account_type: form.account_type, full_name: form.full_name, email: form.email, password: form.password,
    org_name: form.org_name, org_email: form.org_email, work_email: form.work_email, industry: form.industry, team_size: form.team_size,
  }
  try {
    await api('/api/auth/register', { method: 'POST', body })
  } catch (e) {
    if (!(e instanceof NetworkError)) throw e
    await localRegister(form)
  }
  return login(form.email, form.password, remember)
}

// Re-validates a saved API session on page load. Returns the fresh user, null if the session is invalid.
export async function refreshSession(session) {
  if (session.mode !== 'api') return session.user
  try {
    const { user } = await api('/api/auth/me', { token: session.token })
    updateStoredUser(user)
    return user
  } catch (e) {
    if (e instanceof AuthError) return null
    return session.user // server unreachable: keep cached profile
  }
}

export async function updateProfile(session, changes) {
  if (session.mode === 'api') {
    const { user } = await api('/api/auth/me', { method: 'PUT', body: changes, token: session.token })
    updateStoredUser(user)
    return user
  }
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === session.user.id)
  if (idx < 0) throw new AuthError('Account not found.', 401)
  const next = { ...users[idx] }
  const isOrg = next.account_type === 'organization'
  for (const k of ['full_name', 'phone', ...(isOrg ? ['org_name', 'org_email', 'work_email', 'industry', 'team_size'] : [])]) {
    if (k in changes) next[k] = String(changes[k] ?? '').trim()
  }
  if (!next.full_name) throw new AuthError('Full name cannot be empty.', 422)
  if (changes.email && changes.email.trim().toLowerCase() !== next.email) {
    const email = changes.email.trim().toLowerCase()
    if (!EMAIL_RE.test(email)) throw new AuthError('Please enter a valid email address.', 422)
    if ((await pbkdf2(changes.current_password || '', next.salt)) !== next.pw_hash) throw new AuthError('Enter your current password to change your email.', 403)
    if (users.some((u, i) => i !== idx && u.email === email)) throw new AuthError('That email is already used by another account.', 409)
    next.email = email
  }
  users[idx] = next
  writeUsers(users)
  const user = publicLocal(next)
  updateStoredUser(user)
  return user
}

export async function changePassword(session, current, next) {
  if (next.length < 8) throw new AuthError('Password must be at least 8 characters.', 422)
  if (session.mode === 'api') {
    await api('/api/auth/password', { method: 'POST', body: { current_password: current, new_password: next }, token: session.token })
    return
  }
  const users = readUsers()
  const idx = users.findIndex((u) => u.id === session.user.id)
  if (idx < 0 || (await pbkdf2(current, users[idx].salt)) !== users[idx].pw_hash) throw new AuthError('Current password is incorrect.', 403)
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  users[idx] = { ...users[idx], salt, pw_hash: await pbkdf2(next, salt) }
  writeUsers(users)
}
