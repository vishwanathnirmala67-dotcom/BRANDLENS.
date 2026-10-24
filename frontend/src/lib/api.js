import { localReview } from './checker'

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

// Brand Kit and reviews are stored per logged-in user.
let scope = 'guest'
export const setStorageScope = (id) => { scope = id || 'guest' }
const scoped = (key) => `${key}::${scope}`

export const readStore = (key, fallback) => {
  try {
    const saved = localStorage.getItem(scoped(key))
    return saved ? JSON.parse(saved) : fallback
  } catch {
    return fallback
  }
}

export const writeStore = (key, value) => {
  try {
    localStorage.setItem(scoped(key), JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/api/health`, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error()
    return await res.json()
  } catch {
    return null
  }
}

// Calls the backend; falls back to the in-browser rule engine if it is unreachable.
export async function reviewContent(content, token) {
  const rules = readStore('brandlens-rules', {})
  const voice = readStore('brandlens-voice', {})
  const payload = {
    content,
    approved_words: rules.approved || '',
    avoid_words: rules.avoid || '',
    claims: rules.claims || '',
    palette: rules.palette || '',
    voice,
  }
  try {
    const res = await fetch(`${API_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    })
    if (!res.ok) throw new Error(`API ${res.status}`)
    return { ...(await res.json()), source: 'api' }
  } catch {
    return { ...localReview(payload), source: 'offline' }
  }
}
