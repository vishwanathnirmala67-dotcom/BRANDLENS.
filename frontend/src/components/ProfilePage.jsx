import { useState } from 'react'
import { motion } from 'framer-motion'
import { LogOut, Pencil, X, Check, KeyRound, Building2, UserRound } from 'lucide-react'
import { initials } from '../lib/auth'

const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'
const fmtDate = (ts) => (ts ? new Date(ts * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function Row({ label, value }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-0 sm:grid sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm text-slate-800 sm:mt-0">{value || <span className="text-slate-400">Not set</span>}</dd>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
    </label>
  )
}

export default function ProfilePage({ auth, onLogout }) {
  const { user, mode } = auth
  const isOrg = user.account_type === 'organization'
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState({ open: false, current: '', next: '', confirm: '' })

  const start = () => {
    setForm({
      full_name: user.full_name, email: user.email, phone: user.phone || '',
      org_name: user.org_name || '', org_email: user.org_email || '', work_email: user.work_email || '',
      industry: user.industry || '', team_size: user.team_size || '', current_password: '',
    })
    setMsg({ text: '', error: false })
    setEditing(true)
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const emailChanged = form && form.email.trim().toLowerCase() !== user.email

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    try {
      const changes = { full_name: form.full_name, phone: form.phone }
      if (isOrg) Object.assign(changes, { org_name: form.org_name, org_email: form.org_email, work_email: form.work_email, industry: form.industry, team_size: form.team_size })
      if (emailChanged) Object.assign(changes, { email: form.email, current_password: form.current_password })
      await auth.saveProfile(changes)
      setEditing(false)
      setMsg({ text: 'Profile updated.', error: false })
    } catch (err) {
      setMsg({ text: err.message || 'Could not save changes.', error: true })
    } finally {
      setBusy(false)
    }
  }

  async function savePassword(e) {
    e.preventDefault()
    if (pw.next !== pw.confirm) return setMsg({ text: 'New passwords do not match.', error: true })
    setBusy(true)
    try {
      await auth.changePassword(pw.current, pw.next)
      setPw({ open: false, current: '', next: '', confirm: '' })
      setMsg({ text: 'Password changed.', error: false })
    } catch (err) {
      setMsg({ text: err.message || 'Could not change password.', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Profile</h1>
          <p className="mt-2 text-sm text-slate-500">Your account details and security.</p>
        </div>
        <button onClick={onLogout} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100"><LogOut size={17} /> Log out</button>
      </div>

      {msg.text && (
        <p role="status" className={`mt-5 rounded-xl border px-4 py-3 text-sm ${msg.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>
      )}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-xl font-bold text-white">{initials(user.full_name)}</div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900">{user.full_name}</h2>
              <p className="truncate text-sm text-slate-500">{user.email}</p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
                {isOrg ? <Building2 size={13} /> : <UserRound size={13} />} {isOrg ? 'Organization account' : 'Individual account'}
              </span>
            </div>
          </div>
          {!editing && (
            <button onClick={start} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"><Pencil size={16} /> Edit details</button>
          )}
        </div>

        {!editing ? (
          <dl className="mt-6">
            <Row label="Full name" value={user.full_name} />
            <Row label="Email" value={user.email} />
            <Row label="Phone" value={user.phone} />
            <Row label="Account type" value={isOrg ? 'Organization' : 'Individual'} />
            {isOrg && (
              <>
                <Row label="Organization" value={user.org_name} />
                <Row label="Organization email" value={user.org_email} />
                <Row label="Admin work email" value={user.work_email} />
                <Row label="Industry" value={user.industry} />
                <Row label="Team size" value={user.team_size} />
              </>
            )}
            <Row label="Member since" value={fmtDate(user.created_at)} />
            <Row label="Last sign-in" value={fmtDate(user.last_login)} />
            <Row label="Account storage" value={mode === 'api' ? 'BrandLens server (passwords hashed)' : 'This browser only (offline account)'} />
          </dl>
        ) : (
          <form onSubmit={save} className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Full name"><input className={input} value={form.full_name} onChange={set('full_name')} required /></Field>
            <Field label="Phone"><input className={input} value={form.phone} onChange={set('phone')} placeholder="+91 …" /></Field>
            <div className="sm:col-span-2">
              <Field label="Email" hint={emailChanged ? 'Changing email needs your current password.' : undefined}>
                <input className={input} type="email" value={form.email} onChange={set('email')} required />
              </Field>
            </div>
            {emailChanged && (
              <div className="sm:col-span-2">
                <Field label="Current password"><input className={input} type="password" value={form.current_password} onChange={set('current_password')} autoComplete="current-password" required /></Field>
              </div>
            )}
            {isOrg && (
              <>
                <Field label="Organization name"><input className={input} value={form.org_name} onChange={set('org_name')} required /></Field>
                <Field label="Organization email"><input className={input} type="email" value={form.org_email} onChange={set('org_email')} /></Field>
                <Field label="Admin work email"><input className={input} type="email" value={form.work_email} onChange={set('work_email')} /></Field>
                <Field label="Industry"><input className={input} value={form.industry} onChange={set('industry')} /></Field>
                <Field label="Team size">
                  <select className={input} value={form.team_size} onChange={set('team_size')}>
                    <option value="">Select size</option>
                    {['1–10', '11–50', '51–200', '201+'].map((s) => <option key={s}>{s}</option>)}
                  </select>
                </Field>
              </>
            )}
            <div className="flex gap-3 sm:col-span-2">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"><Check size={16} /> {busy ? 'Saving…' : 'Save changes'}</button>
              <button type="button" onClick={() => setEditing(false)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"><X size={16} /> Cancel</button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-slate-100 p-2.5 text-slate-600"><KeyRound size={18} /></span>
            <div>
              <h2 className="font-bold text-slate-900">Password</h2>
              <p className="text-xs text-slate-500">Use at least 8 characters.</p>
            </div>
          </div>
          {!pw.open && <button onClick={() => setPw({ ...pw, open: true })} className="text-sm font-semibold text-indigo-600 hover:text-indigo-800">Change password</button>}
        </div>
        {pw.open && (
          <form onSubmit={savePassword} className="mt-5 grid gap-4 sm:grid-cols-3">
            <Field label="Current password"><input className={input} type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required /></Field>
            <Field label="New password"><input className={input} type="password" autoComplete="new-password" minLength={8} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} required /></Field>
            <Field label="Confirm new password"><input className={input} type="password" autoComplete="new-password" minLength={8} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required /></Field>
            <div className="flex gap-3 sm:col-span-3">
              <button type="submit" disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">Update password</button>
              <button type="button" onClick={() => setPw({ open: false, current: '', next: '', confirm: '' })} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
            </div>
          </form>
        )}
      </div>
    </motion.section>
  )
}
