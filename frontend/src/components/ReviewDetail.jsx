import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, CheckCircle2, XCircle, AlertTriangle, Lightbulb } from 'lucide-react'

export const statusStyles = {
  'Needs review': 'bg-amber-50 text-amber-700 ring-amber-200',
  'Pending approval': 'bg-blue-50 text-blue-700 ring-blue-200',
  Approved: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const sevStyles = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function Highlighted({ text, findings }) {
  const matches = [...new Set(findings.filter((f) => f.severity !== 'low' && f.match).map((f) => f.match))]
    .sort((a, b) => b.length - a.length)
  if (!matches.length) return <>{text}</>
  const re = new RegExp(`(${matches.map(esc).join('|')})`, 'gi')
  return text.split(re).map((part, i) =>
    matches.some((m) => m.toLowerCase() === part.toLowerCase())
      ? <mark key={i} className="rounded bg-amber-200/80 px-0.5 text-slate-900">{part}</mark>
      : <span key={i}>{part}</span>,
  )
}

export function ScoreBadge({ score }) {
  if (score == null) return <span className="text-slate-400">—</span>
  const tone = score >= 90 ? 'text-emerald-600' : score >= 70 ? 'text-amber-600' : 'text-rose-600'
  return <span className={`font-semibold ${tone}`}>{score}%</span>
}

export default function ReviewDetail({ review, onClose, onDecision }) {
  const [comment, setComment] = useState('')
  const findings = review.findings || []
  const decided = review.status === 'Approved' || review.status === 'Rejected'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex justify-end bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.aside
        initial={{ x: 60 }}
        animate={{ x: 0 }}
        exit={{ x: 60 }}
        className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7"
        role="dialog"
        aria-label="Review details"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ring-1 ring-inset ${statusStyles[review.status]}`}>{review.status}</span>
            <h2 className="mt-3 break-words text-xl font-bold text-slate-900">{review.title}</h2>
            <p className="mt-1 text-xs text-slate-500">{review.type} · {review.time}</p>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={20} /></button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl"><ScoreBadge score={review.score} /></p><p className="text-[11px] text-slate-500">Brand score</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{findings.filter((f) => f.severity !== 'low').length}</p><p className="text-[11px] text-slate-500">Issues</p></div>
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-2xl font-bold text-slate-800">{findings.filter((f) => f.severity === 'low').length}</p><p className="text-[11px] text-slate-500">Suggestions</p></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Checked by: {review.engine || 'rules'} · {review.source === 'offline' ? 'offline fallback (API unreachable)' : 'BrandLens API'}</p>

        <h3 className="mt-6 text-sm font-bold text-slate-900">Your draft</h3>
        <p className="mt-2 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
          <Highlighted text={review.submittedContent || ''} findings={findings} />
        </p>

        <h3 className="mt-6 text-sm font-bold text-slate-900">Findings</h3>
        {findings.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} /> No brand issues found. Ready for human approval.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {findings.map((f, i) => (
              <li key={i} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  {f.severity === 'low' ? <Lightbulb size={16} className="text-slate-400" /> : <AlertTriangle size={16} className="text-amber-600" />}
                  <span className="text-sm font-semibold text-slate-800">{f.type}</span>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${sevStyles[f.severity]}`}>{f.severity}</span>
                </div>
                {f.match && <p className="mt-2 break-words rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">“{f.match}”</p>}
                <p className="mt-2 text-sm text-slate-600">{f.reason}</p>
                {f.suggestion && <p className="mt-1 text-sm font-medium text-indigo-700">→ {f.suggestion}</p>}
              </li>
            ))}
          </ul>
        )}

        <h3 className="mt-6 text-sm font-bold text-slate-900">Human decision</h3>
        {review.decisionComment && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Reviewer note: {review.decisionComment}</p>}
        {!decided ? (
          <div className="mt-2">
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Reviewer comment (optional)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400" />
            <div className="mt-3 flex gap-3">
              <button onClick={() => onDecision(review.id, 'Approved', comment)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"><CheckCircle2 size={16} /> Approve</button>
              <button onClick={() => onDecision(review.id, 'Rejected', comment)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"><XCircle size={16} /> Reject</button>
            </div>
            {findings.some((f) => f.severity === 'high') && <p className="mt-2 text-xs text-amber-700">High-severity issues exist. Approve only if a human has verified them.</p>}
          </div>
        ) : (
          <button onClick={() => onDecision(review.id, 'Pending approval', '')} className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800">Reopen review</button>
        )}
      </motion.aside>
    </motion.div>
  )
}
