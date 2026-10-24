import { useState } from 'react'
import { BookOpen, ShieldCheck } from 'lucide-react'
import { readStore, writeStore } from '../lib/api'

const inputClass =
  'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400'
const btnClass = 'rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700'

function useStoredForm(key, initial) {
  const [data, setData] = useState(() => ({ ...initial, ...readStore(key, {}) }))
  const [saved, setSaved] = useState(false)
  const update = (field, value) => {
    setData((c) => ({ ...c, [field]: value }))
    setSaved(false)
  }
  const save = (e) => {
    e.preventDefault()
    writeStore(key, data)
    setSaved(true)
  }
  return { data, update, save, saved }
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
      {hint && <span className="mt-1 block text-xs font-normal text-slate-400">{hint}</span>}
    </label>
  )
}

function BrandVoiceForm() {
  const { data, update, save, saved } = useStoredForm('brandlens-voice', { name: '', audience: '', tone: '', style: '' })
  return (
    <form onSubmit={save} className="mt-5 space-y-4">
      <Field label="Brand name">
        <input className={inputClass} value={data.name} onChange={(e) => update('name', e.target.value)} placeholder="e.g. BrandLens" required />
      </Field>
      <Field label="Target audience">
        <input className={inputClass} value={data.audience} onChange={(e) => update('audience', e.target.value)} placeholder="e.g. Young professionals" />
      </Field>
      <Field label="Brand tone" hint="Professional / Confident / Friendly / Empathetic are checked automatically.">
        <select className={inputClass} value={data.tone} onChange={(e) => update('tone', e.target.value)} required>
          <option value="">Select tone</option>
          {['Professional', 'Friendly', 'Confident', 'Playful', 'Empathetic'].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Field>
      <Field label="Writing guidelines">
        <textarea className={inputClass} rows={3} value={data.style} onChange={(e) => update('style', e.target.value)} placeholder="Describe how your brand should communicate..." />
      </Field>
      <button type="submit" className={btnClass}>Save brand voice</button>
      {saved && <p role="status" className="text-sm text-emerald-700">Brand voice saved in this browser.</p>}
    </form>
  )
}

function BrandRulesForm() {
  const { data, update, save, saved } = useStoredForm('brandlens-rules', { approved: '', avoid: '', claims: '', palette: '' })
  return (
    <form onSubmit={save} className="mt-5 space-y-4">
      <Field label="Approved terms" hint="Comma or new line separated.">
        <textarea className={inputClass} rows={2} value={data.approved} onChange={(e) => update('approved', e.target.value)} placeholder="e.g. members, sustainable" />
      </Field>
      <Field label="Words to avoid" hint='Optional replacement: cheap => affordable'>
        <textarea className={inputClass} rows={2} value={data.avoid} onChange={(e) => update('avoid', e.target.value)} placeholder="e.g. cheap => affordable, guru" />
      </Field>
      <Field label="Approved claims and sources" hint="One per line: fact | source. Numbers and superlatives not listed here get flagged.">
        <textarea className={inputClass} rows={3} value={data.claims} onChange={(e) => update('claims', e.target.value)} placeholder="Customers save 30% on average | https://example.com/report" />
      </Field>
      <Field label="Brand colours (assets)" hint="Hex codes. Any other hex colour used in a draft is flagged.">
        <input className={inputClass} value={data.palette} onChange={(e) => update('palette', e.target.value)} placeholder="#4f46e5, #0f172a, #ffffff" />
      </Field>
      <button type="submit" className={btnClass}>Save brand rules</button>
      {saved && <p role="status" className="text-sm text-emerald-700">Brand rules saved in this browser.</p>}
    </form>
  )
}

export default function BrandKit() {
  return (
    <section>
      <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Brand Kit</h1>
      <p className="mt-2 text-sm text-slate-500">Guidelines, facts and assets that every draft is checked against.</p>
      <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><BookOpen size={21} /></span>
          <h2 className="mt-4 font-bold text-slate-900">Brand voice & tone</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Tell your team how the brand should sound and who it speaks to.</p>
          <BrandVoiceForm />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={21} /></span>
          <h2 className="mt-4 font-bold text-slate-900">Terms, claims & assets</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">Guidelines + facts + assets: the three things BrandLens verifies.</p>
          <BrandRulesForm />
        </div>
      </div>
    </section>
  )
}
