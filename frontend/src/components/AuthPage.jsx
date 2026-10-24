import { useState } from 'react'
import '../auth.css'
import { login, signup, validateSignup } from '../lib/auth'

const empty = {
  full_name: '', email: '', password: '', confirm: '',
  org_name: '', org_email: '', work_email: '', industry: '', team_size: '',
  terms: false,
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div className="input-wrap">
      <input className="input has-show" id={id} type={show ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete} />
      <button className="show" type="button" onClick={() => setShow((s) => !s)}>{show ? 'HIDE' : 'SHOW'}</button>
    </div>
  )
}

export default function AuthPage({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [type, setType] = useState('individual')
  const [form, setForm] = useState(empty)
  const [remember, setRemember] = useState(true)
  const [notice, setNotice] = useState({ text: '', error: false })
  const [busy, setBusy] = useState(false)

  const signupMode = mode === 'signup'
  const org = type === 'organization'
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const fail = (text) => setNotice({ text, error: true })

  function switchMode(next) {
    setMode(next)
    setNotice({ text: '', error: false })
  }

  async function submit(e) {
    e.preventDefault()
    setNotice({ text: '', error: false })
    const email = form.email.trim()
    if (!signupMode) {
      if (!email || !email.includes('@') || !email.includes('.')) return fail('Please enter a valid email address.')
      if (!form.password) return fail('Please enter your password.')
    } else {
      const problem = validateSignup({ ...form, account_type: type })
      if (problem) return fail(problem)
    }
    setBusy(true)
    try {
      const session = signupMode
        ? await signup({ ...form, account_type: type }, true)
        : await login(email, form.password, remember)
      onAuthed(session)
    } catch (err) {
      fail(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-root">
      <main className="wrap">
        <div className="brand">
          <div className="logo">B</div>
          <div>
            <div className="brand-name">Brand<span>Lens</span></div>
            <div className="tagline">Make every message on-brand.</div>
          </div>
        </div>

        <section className="card">
          <div className="eyebrow">Brand governance workspace</div>
          <h1>{signupMode ? 'Create your workspace' : 'Welcome back'}</h1>
          <p className="sub">
            {signupMode
              ? 'Set up a workspace to keep your content aligned with your brand.'
              : 'Sign in to review content, manage brand rules, and keep your messaging consistent.'}
          </p>

          <div className="tabs" role="tablist" aria-label="Account screen">
            <button className={`tab ${!signupMode ? 'active' : ''}`} type="button" onClick={() => switchMode('login')}>Log in</button>
            <button className={`tab ${signupMode ? 'active' : ''}`} type="button" onClick={() => switchMode('signup')}>Create account</button>
          </div>

          {notice.text && <div className={`notice show ${notice.error ? 'err' : ''}`} role="alert">{notice.text}</div>}

          <form onSubmit={submit} noValidate>
            {signupMode && (
              <>
                <div className="field">
                  <label>Account type</label>
                  <div className="tabs" style={{ margin: '0 0 17px' }}>
                    <button className={`tab ${!org ? 'active' : ''}`} type="button" onClick={() => setType('individual')}>Individual</button>
                    <button className={`tab ${org ? 'active' : ''}`} type="button" onClick={() => setType('organization')}>Organization</button>
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="fullName">Full name</label>
                  <input className="input" id="fullName" autoComplete="name" value={form.full_name} onChange={set('full_name')} placeholder={org ? 'Admin full name' : 'Your full name'} />
                </div>
              </>
            )}

            {signupMode && org && (
              <div>
                <div className="field"><label htmlFor="orgName">Organization name</label><input className="input" id="orgName" value={form.org_name} onChange={set('org_name')} placeholder="e.g. Acme Studio" /></div>
                <div className="field"><label htmlFor="orgEmail">Organization email</label><input className="input" id="orgEmail" type="email" value={form.org_email} onChange={set('org_email')} placeholder="team@company.com" /></div>
                <div className="field"><label htmlFor="workEmail">Admin&apos;s work email</label><input className="input" id="workEmail" type="email" value={form.work_email} onChange={set('work_email')} placeholder="you@company.com" /></div>
                <div className="row">
                  <div className="field"><label htmlFor="industry">Industry <span style={{ color: '#7890a6', fontWeight: 400 }}>(optional)</span></label><input className="input" id="industry" value={form.industry} onChange={set('industry')} placeholder="e.g. Technology" /></div>
                  <div className="field">
                    <label htmlFor="teamSize">Team size <span style={{ color: '#7890a6', fontWeight: 400 }}>(optional)</span></label>
                    <select className="input" id="teamSize" value={form.team_size} onChange={set('team_size')}>
                      <option value="">Select size</option>
                      {['1–10', '11–50', '51–200', '201+'].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="field">
              <label htmlFor="email">{signupMode && org ? 'Account login email' : 'Email address'}</label>
              <input className="input" id="email" type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder={signupMode && org ? 'admin@company.com' : 'you@example.com'} />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordInput id="password" value={form.password} onChange={set('password')} placeholder={signupMode ? 'At least 8 characters' : 'Enter your password'} autoComplete={signupMode ? 'new-password' : 'current-password'} />
            </div>

            {signupMode && (
              <div className="field">
                <label htmlFor="confirmPassword">Confirm password</label>
                <PasswordInput id="confirmPassword" value={form.confirm} onChange={set('confirm')} placeholder="Enter password again" autoComplete="new-password" />
              </div>
            )}

            {!signupMode ? (
              <div className="minor">
                <label className="check" style={{ margin: 0, fontWeight: 500 }}>
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
                </label>
                <button className="link" type="button" onClick={() => setNotice({ text: 'Password reset by email is not available yet. If you are logged in, use Profile → Change password; otherwise ask your workspace admin.', error: false })}>Forgot password?</button>
              </div>
            ) : (
              <div className="field">
                <label className="check" style={{ fontWeight: 500 }}>
                  <input type="checkbox" checked={form.terms} onChange={set('terms')} /> <span>I agree to the Terms of Service and Privacy Policy.</span>
                </label>
              </div>
            )}

            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : signupMode ? `Create ${org ? 'organization' : 'individual'} workspace →` : 'Sign in to BrandLens →'}
            </button>
          </form>

          <div className="divider">SECURE BRAND WORKSPACE</div>
          <p className="switch">
            {signupMode ? 'Already have an account?' : 'New to BrandLens?'}
            <button className="link" type="button" onClick={() => switchMode(signupMode ? 'login' : 'signup')}>{signupMode ? 'Log in' : 'Create an account'}</button>
          </p>
          <div className="note">
            <strong style={{ color: '#c8e8f5' }}>Your data:</strong> passwords are hashed on the BrandLens server and never stored in plain text. If the server cannot be reached, an offline account is kept only in this browser.
          </div>
        </section>
        <div className="footer">BrandLens · Brand consistency, with confidence</div>
      </main>
    </div>
  )
}
