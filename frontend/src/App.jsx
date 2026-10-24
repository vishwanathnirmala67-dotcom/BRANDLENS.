import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, FileCheck2, ShieldCheck, BookOpen,
  Settings, Bell, Search, Plus, ArrowUpRight,
  ArrowRight, Clock3, CheckCircle2, AlertTriangle,
  FileText, Menu, X, ChevronDown, Sparkles,
  CircleHelp, TrendingUp, XCircle, Loader2, Trash2, UserRound, LogOut,
} from 'lucide-react'
import BrandKit from './components/BrandKit'
import ProfilePage from './components/ProfilePage'
import { initials } from './lib/auth'
import ReviewDetail, { statusStyles, ScoreBadge } from './components/ReviewDetail'
import { API_URL, checkHealth, readStore, reviewContent, writeStore } from './lib/api'

const navigation = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Content Reviews', icon: FileCheck2 },
  { label: 'Brand Kit', icon: BookOpen },
  { label: 'Approvals', icon: ShieldCheck },
]

const seedReviews = [
  { id: 's1', sample: true, title: 'October product launch', type: 'Social media', status: 'Needs review', score: 70, createdAt: Date.now() - 12 * 60000, engine: 'sample', source: 'sample',
    submittedContent: 'Our cheap new plan is the best on the market and grows revenue by 300%!!!',
    findings: [
      { type: 'Restricted word', severity: 'high', match: 'cheap', reason: '"cheap" is on the Brand Kit avoid list.', suggestion: 'Replace with "affordable".' },
      { type: 'Unverified claim', severity: 'high', match: 'grows revenue by 300%', reason: 'Statistic is not in the approved claims list.', suggestion: 'Add the fact with its source to the Brand Kit, or remove the figure.' },
    ] },
  { id: 's2', sample: true, title: 'Customer success newsletter', type: 'Email campaign', status: 'Approved', score: 96, createdAt: Date.now() - 3600000, engine: 'sample', source: 'sample', submittedContent: 'Thank you for being part of our community this month.', findings: [] },
  { id: 's3', sample: true, title: 'New feature announcement', type: 'Website copy', status: 'Pending approval', score: 88, createdAt: Date.now() - 3 * 3600000, engine: 'sample', source: 'sample', submittedContent: 'Introducing smart reports for every team.', findings: [] },
  { id: 's4', sample: true, title: 'Autumn campaign headlines', type: 'Ad copy', status: 'Approved', score: 98, createdAt: Date.now() - 86400000, engine: 'sample', source: 'sample', submittedContent: 'Warm up your workflow this autumn.', findings: [] },
]

const timeAgo = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} hour${h > 1 ? 's' : ''} ago` : `${Math.round(h / 24)} day(s) ago`
}
const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function StatusChip({ status }) {
  return <span className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset ${statusStyles[status] || statusStyles['Pending approval']}`}>{status}</span>
}

function App({ auth }) {
  const user = auth.user
  const [activePage, setActivePage] = useState('Dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showComposer, setShowComposer] = useState(false)
  const [content, setContent] = useState('')
  const [goal, setGoal] = useState('Social media')
  const [reviews, setReviews] = useState(() => readStore('brandlens-reviews', seedReviews))
  const [selectedId, setSelectedId] = useState(null)
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [api, setApi] = useState({ state: 'checking' })

  useEffect(() => { writeStore('brandlens-reviews', reviews) }, [reviews])
  useEffect(() => {
    checkHealth().then((h) => setApi(h ? { state: 'online', ai: h.ai_tone_check } : { state: 'offline' }))
  }, [])

  const selected = reviews.find((r) => r.id === selectedId)
  const pending = reviews.filter((r) => r.status === 'Needs review' || r.status === 'Pending approval')
  const scored = reviews.filter((r) => r.score != null)
  const stats = useMemo(() => ({
    health: scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : 0,
    total: reviews.length,
    attention: reviews.filter((r) => r.status === 'Needs review').length,
    approved: reviews.filter((r) => r.status === 'Approved').length,
  }), [reviews, scored])

  async function startReview() {
    if (!content.trim()) {
      setNotice('Please enter some content before starting a review.')
      return
    }
    setLoading(true)
    const text = content.trim()
    const result = await reviewContent(text, auth.mode === 'api' ? auth.token : undefined)
    const review = {
      id: `r${Date.now()}`,
      title: text.split('\n')[0].slice(0, 48) || 'New content review',
      type: goal,
      status: result.passed ? 'Pending approval' : 'Needs review',
      score: result.score,
      createdAt: Date.now(),
      submittedContent: text,
      findings: result.findings,
      engine: result.engine,
      source: result.source,
    }
    setReviews((prev) => [review, ...prev])
    setLoading(false)
    setShowComposer(false)
    setContent('')
    setActivePage('Content Reviews')
    setSelectedId(review.id)
    setNotice(`Review complete: score ${result.score}%, ${result.findings.filter((f) => f.severity !== 'low').length} issue(s). A human must still approve it.`)
  }

  function decide(id, status, comment) {
    setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, status, decisionComment: comment || undefined } : r)))
    setNotice(status === 'Pending approval' ? 'Review reopened.' : `Review ${status.toLowerCase()}.`)
  }

  const filtered = reviews.filter((r) => `${r.title} ${r.type} ${r.status}`.toLowerCase().includes(search.toLowerCase()))

  function navigate(page) {
    setActivePage(page)
    setMobileOpen(false)
    setNotice('')
  }

  const apiPill = {
    checking: { dot: 'bg-slate-300', text: 'Connecting…' },
    online: { dot: 'bg-emerald-500', text: api.ai ? 'API online · AI tone' : 'API online' },
    offline: { dot: 'bg-amber-500', text: 'Offline mode' },
  }[api.state]

  return (
    <div className="min-h-screen bg-[#f7f8fc] text-slate-800">
      <AnimatePresence>
        {mobileOpen && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />
        )}
      </AnimatePresence>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col overflow-y-auto border-r border-slate-200/80 bg-white px-5 py-6 transition-transform duration-300 lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-1">
          <button onClick={() => navigate('Dashboard')} className="flex items-center gap-3 text-left">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><ShieldCheck size={23} strokeWidth={2.2} /></span>
            <span>
              <span className="block text-xl font-bold tracking-tight text-slate-900">BrandLens</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Brand governance</span>
            </span>
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 lg:hidden" aria-label="Close menu"><X size={20} /></button>
        </div>

        <div className="mt-10">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Workspace</p>
          <nav className="space-y-1">
            {navigation.map(({ label, icon: Icon }) => (
              <button key={label} onClick={() => navigate(label)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200 ${activePage === label ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}>
                <Icon size={19} /><span>{label}</span>
                {label === 'Approvals' && pending.length > 0 && <span className="ml-auto rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{pending.length}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="mt-9">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Preferences</p>
          <button onClick={() => navigate('Profile')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition hover:bg-slate-50 ${activePage === 'Profile' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}><UserRound size={19} /> Profile</button>
          <button onClick={() => navigate('Settings')} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition hover:bg-slate-50 ${activePage === 'Settings' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}><Settings size={19} /> Settings</button>
          <button onClick={() => setNotice('Help: BrandLens flags guideline, fact and asset issues. A human always makes the final approval.')} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-500 transition hover:bg-slate-50"><CircleHelp size={19} /> Help & support</button>
        </div>

        <div className="mt-auto pt-8">
          <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-700 p-4 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15"><Sparkles size={19} /></span>
            <p className="mt-3 text-sm font-semibold">Your brand, consistent.</p>
            <p className="mt-1 text-xs leading-5 text-indigo-100">Keep every message aligned with your brand guidelines.</p>
            <button onClick={() => navigate('Brand Kit')} className="mt-4 flex items-center gap-2 text-xs font-semibold text-white transition-all hover:gap-3">Explore Brand Kit <ArrowRight size={14} /></button>
          </div>
          <div className="mt-5 border-t border-slate-100 px-1 pt-5">
            <button onClick={() => navigate('Profile')} className="flex w-full items-center gap-3 rounded-xl text-left transition hover:bg-slate-50" aria-label="Open profile">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{initials(user.full_name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800">{user.full_name}</span>
                <span className="block truncate text-xs text-slate-500">{user.account_type === 'organization' && user.org_name ? user.org_name : user.email}</span>
              </span>
            </button>
            <button onClick={auth.logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><LogOut size={16} /> Log out</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={21} /></button>
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-500">Workspace / <span className="text-slate-700">{activePage}</span></p>
              <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">BrandLens Workspace</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 sm:flex"><span className={`h-2 w-2 rounded-full ${apiPill.dot}`} /> {apiPill.text}</span>
            <button onClick={() => navigate('Approvals')} className="relative rounded-xl p-2.5 text-slate-500 transition hover:bg-slate-100" aria-label={`${pending.length} pending approvals`}>
              <Bell size={19} />
              {pending.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />}
            </button>
            <div className="hidden h-8 w-px bg-slate-200 sm:block" />
            <button onClick={() => navigate('Profile')} aria-label="Open profile" className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white">{initials(user.full_name)}</button>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
          <AnimatePresence>
            {notice && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} role="status" className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                <span>{notice}</span>
                <button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={17} /></button>
              </motion.div>
            )}
          </AnimatePresence>

          {activePage === 'Dashboard' && (
            <>
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div>
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700"><Sparkles size={13} /> Your brand command centre</div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{greeting()}, {user.full_name.split(' ')[0]} <span aria-hidden="true">✦</span></h1>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">Check every draft against your guidelines, approved facts and brand assets before it is published.</p>
                </div>
                <button onClick={() => setShowComposer(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-700 active:translate-y-0"><Plus size={18} /> New content review</button>
              </motion.div>

              <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Brand health score', value: `${stats.health}%`, icon: ShieldCheck, tint: 'bg-indigo-50 text-indigo-600', trend: 'Average score of all reviews' },
                  { label: 'Total reviews', value: String(stats.total), icon: FileText, tint: 'bg-blue-50 text-blue-600', trend: 'Across content types' },
                  { label: 'Needs attention', value: String(stats.attention), icon: AlertTriangle, tint: 'bg-amber-50 text-amber-600', trend: 'Issues found by the checker' },
                  { label: 'Approved content', value: String(stats.approved), icon: CheckCircle2, tint: 'bg-emerald-50 text-emerald-600', trend: 'Approved by a human' },
                ].map((stat, i) => (
                  <motion.div key={stat.label} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.35 }} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-md sm:p-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-500">{stat.label}</span>
                      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stat.tint}`}><stat.icon size={20} /></span>
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-2">
                      <p className="text-3xl font-bold tracking-tight text-slate-900">{stat.value}</p>
                      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-600"><TrendingUp size={13} /> Live</span>
                    </div>
                    <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{stat.trend}</div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-7 grid grid-cols-1 gap-6 xl:grid-cols-[1.65fr_1fr]">
                <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                  <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">Recent content reviews</h2>
                      <p className="mt-1 text-xs text-slate-500">Click a row to see findings</p>
                    </div>
                    <button onClick={() => navigate('Content Reviews')} className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800">View all <ArrowUpRight size={16} /></button>
                  </div>
                  <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
                    <div className="relative flex-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search content..." aria-label="Search content" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100" />
                    </div>
                    <span className="text-xs text-slate-500">{filtered.length} reviews shown</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[540px] text-left">
                      <thead className="bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        <tr><th className="px-6 py-3">Content</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Score</th><th className="px-6 py-3">Updated</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filtered.slice(0, 8).map((r) => (
                          <tr key={r.id} onClick={() => setSelectedId(r.id)} className="cursor-pointer transition hover:bg-slate-50/80">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><FileText size={17} /></span>
                                <div className="min-w-0">
                                  <p className="max-w-[200px] truncate text-sm font-semibold text-slate-800">{r.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{r.type}{r.sample && ' · sample'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4"><StatusChip status={r.status} /></td>
                            <td className="px-4 py-4 text-sm"><ScoreBadge score={r.score} /></td>
                            <td className="whitespace-nowrap px-6 py-4 text-xs text-slate-500">{timeAgo(r.createdAt)}</td>
                          </tr>
                        ))}
                        {filtered.length === 0 && <tr><td colSpan="4" className="px-6 py-10 text-center text-sm text-slate-500">No matching reviews found.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </section>

                <div className="flex flex-col gap-6">
                  <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-slate-900">Review activity</h2>
                        <p className="mt-1 text-xs text-slate-500">Latest reviews</p>
                      </div>
                      <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600"><Clock3 size={19} /></span>
                    </div>
                    <div className="mt-6 space-y-5">
                      {reviews.slice(0, 4).map((r) => {
                        const Icon = r.status === 'Approved' ? CheckCircle2 : r.status === 'Rejected' ? XCircle : AlertTriangle
                        const tint = r.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' : r.status === 'Rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                        return (
                          <div key={r.id} className="flex gap-3">
                            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tint}`}><Icon size={17} /></span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-slate-800">{r.status}</p>
                              <p className="mt-1 truncate text-xs text-slate-500">{r.title}</p>
                              <p className="mt-1.5 text-[11px] text-slate-500">{timeAgo(r.createdAt)}</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </section>

                  <section className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 text-white">
                    <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-indigo-500/20 blur-2xl" />
                    <div className="relative">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Sparkles size={20} className="text-indigo-300" /></span>
                      <h2 className="mt-4 text-lg font-bold">Ready for a brand check?</h2>
                      <p className="mt-2 text-sm leading-6 text-slate-300">Review your next piece of content against your brand standards.</p>
                      <button onClick={() => setShowComposer(true)} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-indigo-50">Start a review <ArrowRight size={16} /></button>
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}

          {activePage === 'Content Reviews' && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Content reviews</h1>
                  <p className="mt-2 text-sm text-slate-500">Open a review to see highlighted issues and suggested fixes.</p>
                </div>
                <div className="flex gap-2">
                  {reviews.some((r) => r.sample) && (
                    <button onClick={() => setReviews((p) => p.filter((r) => !r.sample))} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"><Trash2 size={16} /> Clear samples</button>
                  )}
                  <button onClick={() => setShowComposer(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"><Plus size={18} /> New review</button>
                </div>
              </div>
              <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
                {reviews.map((r) => (
                  <button key={r.id} onClick={() => setSelectedId(r.id)} className="rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-xl bg-indigo-50 p-3 text-indigo-600"><FileText size={20} /></span>
                      <StatusChip status={r.status} />
                    </div>
                    <h2 className="mt-4 break-words font-bold text-slate-900">{r.title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{r.type}{r.sample && ' · sample'}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-500">
                      <span>{timeAgo(r.createdAt)}</span>
                      <span>{(r.findings || []).filter((f) => f.severity !== 'low').length} issue(s) · Score <ScoreBadge score={r.score} /></span>
                    </div>
                  </button>
                ))}
                {reviews.length === 0 && <p className="text-sm text-slate-500">No reviews yet. Start one to see BrandLens in action.</p>}
              </div>
            </motion.section>
          )}

          {activePage === 'Brand Kit' && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}><BrandKit /></motion.div>}

          {activePage === 'Approvals' && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Approvals</h1>
              <p className="mt-2 text-sm text-slate-500">Human review stays part of every publication decision.</p>
              <div className="mt-7 space-y-3">
                {pending.length === 0 && <div className="rounded-2xl border border-slate-200 bg-white p-7 text-sm text-slate-500">Nothing waiting for approval. 🎉</div>}
                {pending.map((r) => (
                  <div key={r.id} className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><StatusChip status={r.status} /><span className="text-xs text-slate-500">{r.type} · {timeAgo(r.createdAt)}</span></div>
                      <p className="mt-2 truncate font-semibold text-slate-900">{r.title}</p>
                      <p className="text-xs text-slate-500">Score <ScoreBadge score={r.score} /> · {(r.findings || []).filter((f) => f.severity !== 'low').length} issue(s)</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button onClick={() => setSelectedId(r.id)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Review</button>
                      <button onClick={() => decide(r.id, 'Approved', '')} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Approve</button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          {activePage === 'Profile' && <ProfilePage auth={auth} onLogout={auth.logout} />}

          {activePage === 'Settings' && (
            <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Settings</h1>
              <p className="mt-2 text-sm text-slate-500">Workspace and connection details.</p>
              <div className="mt-7 space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="font-bold text-slate-900">Review service</h2>
                  <p className="mt-2 text-sm text-slate-600">Endpoint: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{API_URL}</code></p>
                  <p className="mt-1 text-sm text-slate-600">Status: {apiPill.text}. {api.state === 'offline' && 'Reviews use the built-in offline rule checker.'}</p>
                  <button onClick={() => { setApi({ state: 'checking' }); checkHealth().then((h) => setApi(h ? { state: 'online', ai: h.ai_tone_check } : { state: 'offline' })) }} className="mt-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800">Re-check connection</button>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h2 className="font-bold text-slate-900">Data</h2>
                  <p className="mt-2 text-xs text-slate-500">Reviews and Brand Kit are stored in this browser, separately for each logged-in user. Team roles are planned for the next round.</p>
                  <button onClick={() => { setReviews(seedReviews); setNotice('Reviews reset to the sample data.') }} className="mt-3 text-sm font-semibold text-rose-600 hover:text-rose-800">Reset reviews</button>
                </div>
              </div>
            </motion.section>
          )}

          <footer className="mt-10 flex flex-col justify-between gap-2 border-t border-slate-200/80 py-5 text-xs text-slate-500 sm:flex-row sm:items-center">
            <p>© 2026 BrandLens · Built by Orbital Minds</p>
            <p className="flex items-center gap-1.5"><ShieldCheck size={14} /> Human oversight matters</p>
          </footer>
        </main>
      </div>

      <AnimatePresence>
        {selected && <ReviewDetail key={selected.id} review={selected} onClose={() => setSelectedId(null)} onDecision={decide} />}
      </AnimatePresence>

      <AnimatePresence>
        {showComposer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !loading) setShowComposer(false) }}>
            <motion.div initial={{ opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Sparkles size={21} /></span>
                  <h2 className="mt-4 text-xl font-bold text-slate-900">Start a brand review</h2>
                  <p className="mt-1 text-sm text-slate-500">Checks guidelines, facts and assets against your Brand Kit.</p>
                </div>
                <button onClick={() => setShowComposer(false)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close review form"><X size={20} /></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); startReview() }} className="mt-6 space-y-5">
                <div>
                  <label htmlFor="content-goal" className="mb-2 block text-sm font-semibold text-slate-700">Content type</label>
                  <select id="content-goal" value={goal} onChange={(e) => setGoal(e.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">
                    {['Social media', 'Email campaign', 'Website copy', 'Ad copy', 'Blog article'].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="review-content" className="mb-2 block text-sm font-semibold text-slate-700">Your content</label>
                  <textarea id="review-content" value={content} onChange={(e) => setContent(e.target.value.slice(0, 10000))} rows={7} placeholder="Paste your content here..." className="w-full resize-y rounded-xl border border-slate-200 px-4 py-3 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                  <p className="mt-2 text-xs text-slate-500">{content.length} / 10000 characters</p>
                </div>
                <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setShowComposer(false)} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button>
                  <button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">
                    {loading ? <><Loader2 size={16} className="animate-spin" /> Checking…</> : <><Sparkles size={16} /> Run brand check</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default App
