// Offline fallback that mirrors backend/engine.py (rules only, no AI).
// Used when the API is unreachable so the demo never breaks.

const PENALTY = { high: 20, medium: 10, low: 3 }
const SUPERLATIVES = ['best', 'number one', '#1', 'no.1', 'fastest', 'cheapest', 'only', 'guaranteed', 'guarantee', '100%', 'proven', 'revolutionary', 'world-class', 'unbeatable', 'perfect', 'risk-free', 'miracle']
const SLANG = ['gonna', 'wanna', 'lol', 'omg', 'gotcha', 'dude', 'btw', 'kinda', 'sorta']
const HEDGES = ['maybe', 'perhaps', 'might', 'i think', 'we hope', 'sort of', 'kind of', 'probably', 'hopefully']
const COLD = ['hereby', 'pursuant', 'aforementioned', 'whereas', 'notwithstanding']
const STOP = new Set('a an the and or of to in on for with is are was were be our your we you it its this that at by from as'.split(' '))

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w, flags = 'giu') => new RegExp(`(?<![\\p{L}\\p{N}_])${esc(w)}(?![\\p{L}\\p{N}_])`, flags)

export const parseList = (raw) =>
  (Array.isArray(raw) ? raw : String(raw || '').split(/[,\n]/)).map((s) => s.trim()).filter(Boolean)

const parseAvoid = (raw) =>
  parseList(raw).map((item) => {
    const [word, repl] = item.split('=>').map((p) => p.trim())
    return { word, repl: repl || null }
  })

const parseClaims = (raw) =>
  String(raw || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [text, source] = l.split('|').map((p) => p.trim())
    return { text, source: source || null }
  })

const tokens = (t) => new Set((t.toLowerCase().match(/[\p{L}\p{N}%#.]+/gu) || []).filter((x) => !STOP.has(x)))
const claimMatches = (sentence, claims) => {
  const s = tokens(sentence)
  return claims.some((c) => {
    const ct = [...tokens(c.text)]
    return ct.length && ct.filter((x) => s.has(x)).length / ct.length >= 0.6
  })
}
const normHex = (c) => {
  c = c.trim().toLowerCase().replace('#', '')
  return c.length === 3 ? [...c].map((x) => x + x).join('') : c
}
const f = (type, severity, match, reason, suggestion = null) => ({ type, severity, match, reason, suggestion })

export function localReview({ content, avoid_words, approved_words, claims, palette, voice }) {
  const findings = []
  const lowered = content.toLowerCase()

  for (const { word, repl } of parseAvoid(avoid_words)) {
    const m = content.match(wordRe(word))
    if (m) findings.push(f('Restricted word', 'high', m[0], `"${word}" is on the Brand Kit avoid list (used ${m.length}x).`, repl ? `Replace with "${repl}".` : 'Remove or rephrase this word.'))
  }
  for (const word of parseList(approved_words)) {
    if (!wordRe(word).test(content)) findings.push(f('Approved term', 'low', word, `Approved term "${word}" is not used in this draft.`, `Consider using "${word}" where it fits.`))
  }

  const approvedClaims = parseClaims(claims)
  for (const sentence of content.split(/(?<=[.!?।])\s+|\n+/).map((s) => s.trim()).filter(Boolean)) {
    const hasNumber = /\d[\d,.]*\s?(?:%|percent|x\b|times\b|million|billion|k\b)|\b\d{2,}\b/.test(sentence)
    const sup = SUPERLATIVES.find((w) => wordRe(w, 'iu').test(sentence))
    if ((!hasNumber && !sup) || claimMatches(sentence, approvedClaims)) continue
    findings.push(hasNumber
      ? f('Unverified claim', 'high', sentence, 'This sentence contains a statistic/number that is not in the approved claims list.', 'Add the fact with its source to the Brand Kit, or remove the figure.')
      : f('Unsubstantiated superlative', 'medium', sup, `"${sup}" is an absolute claim with no approved supporting source.`, 'Use a measurable, sourced statement instead.'))
  }

  const pal = parseList(palette)
  if (pal.length) {
    const allowed = new Set(pal.map(normHex))
    const seen = new Set()
    for (const code of content.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g) || []) {
      const n = normHex(code)
      if (!allowed.has(n) && !seen.has(n)) {
        seen.add(n)
        findings.push(f('Off-brand colour', 'medium', code, `${code} is not in the brand palette (${pal.join(', ')}).`, 'Use one of the approved brand colours.'))
      }
    }
  }

  const tone = voice?.tone
  if (tone === 'Professional') {
    if ((content.match(/!/g) || []).length > 2) findings.push(f('Tone', 'medium', '!', 'Too many exclamation marks for a Professional tone.', 'Use at most one.'))
    SLANG.filter((w) => wordRe(w, 'iu').test(content)).forEach((w) => findings.push(f('Tone', 'medium', w, `"${w}" is too casual for a Professional tone.`, 'Use formal wording.')))
  } else if (tone === 'Confident') {
    HEDGES.filter((w) => lowered.includes(w)).forEach((w) => findings.push(f('Tone', 'medium', w, `"${w}" sounds uncertain for a Confident tone.`, 'State it directly.')))
  } else if (tone === 'Friendly' || tone === 'Empathetic') {
    COLD.filter((w) => lowered.includes(w)).forEach((w) => findings.push(f('Tone', 'medium', w, `"${w}" is cold/legalistic for a ${tone} tone.`, 'Use warmer, plain language.')))
  }

  const order = { high: 0, medium: 1, low: 2 }
  findings.sort((a, b) => order[a.severity] - order[b.severity])
  const score = Math.max(0, 100 - findings.reduce((s, x) => s + PENALTY[x.severity], 0))
  return {
    findings,
    score,
    passed: !findings.some((x) => x.severity !== 'low'),
    engine: 'rules (offline)',
    summary: Object.fromEntries(['high', 'medium', 'low'].map((s) => [s, findings.filter((x) => x.severity === s).length])),
  }
}
