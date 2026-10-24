import { useEffect, useState } from 'react'
import App from '../App'
import AuthPage from './AuthPage'
import { setStorageScope } from '../lib/api'
import { changePassword, clearSession, loadSession, refreshSession, updateProfile } from '../lib/auth'

export default function AuthGate() {
  const [session, setSession] = useState(() => loadSession())
  const [checking, setChecking] = useState(() => loadSession()?.mode === 'api')

  // Validate a saved server session once on load
  useEffect(() => {
    const saved = loadSession()
    if (!saved || saved.mode !== 'api') return
    refreshSession(saved).then((user) => {
      if (user) setSession({ ...saved, user })
      else {
        clearSession()
        setSession(null)
      }
      setChecking(false)
    })
  }, [])

  if (checking) {
    return <div className="grid min-h-screen place-items-center bg-[#07111f] text-sm text-slate-300">Loading your workspace…</div>
  }

  if (!session) {
    return <AuthPage onAuthed={(s) => { setSession(s) }} />
  }

  // Brand Kit and reviews are kept separately for every user
  setStorageScope(session.user.id)

  const auth = {
    user: session.user,
    mode: session.mode,
    token: session.token,
    async saveProfile(changes) {
      const user = await updateProfile(session, changes)
      setSession((s) => ({ ...s, user }))
      return user
    },
    changePassword: (current, next) => changePassword(session, current, next),
    logout() {
      clearSession()
      setStorageScope('guest')
      setSession(null)
    },
  }

  return <App key={session.user.id} auth={auth} />
}
