# BrandLens
AI-assisted **brand governance** platform by **Orbital Minds**. It checks content *before publishing* against three things: **guidelines** (words, tone), **facts** (approved claims) and **assets** (brand colours).

## Features
| Check | What it does |
|---|---|
| Restricted words | Flags avoid-list words (Unicode-safe, e.g. Hindi) and suggests a replacement (`cheap => affordable`) |
| Approved terms | Soft suggestions when approved terminology is missing |
| Claims / facts | Numbers, percentages and absolute claims ("best", "guaranteed") must match an approved claim (`fact \| source`) |
| Assets | Hex colours not in the brand palette are flagged |
| Tone | Rule-based per tone; upgraded to a Claude review when `ANTHROPIC_API_KEY` is set |
| Scoring | `100 - 20 (high) - 10 (medium) - 3 (suggestion)` |
| Human approval | Approve / reject with reviewer comment, reopen |
| Accounts & profile | Login / signup (individual or organization), profile page with all details, edit, change password, logout. Brand Kit and reviews are stored per user |
| Offline fallback | If the API is down, the browser runs the same rule engine |

## Architecture
```
React + Vite + Tailwind (GitHub Pages)  --POST /api/reviews-->  FastAPI (Render)
        |  localStorage: Brand Kit + reviews                       engine.py (rules + optional Claude)
        └─ offline fallback: lib/checker.js (mirror of engine.py)
```

## Run locally
```bash
# backend
cd backend && pip install -r requirements.txt pytest
uvicorn main:app --reload          # http://localhost:8000/docs
pytest                              # engine + auth tests

# frontend
cd frontend && cp .env.example .env && npm install && npm run dev
```

## Deploy
1. **API:** create a Render Web Service from this repo (`render.yaml` is included). Set `ALLOWED_ORIGINS` to your GitHub Pages origin; optionally `ANTHROPIC_API_KEY`.
2. **Frontend:** in GitHub repo *Settings → Secrets and variables → Actions → Variables* add `VITE_API_URL` = your Render URL. Push to `main`; the workflow publishes to GitHub Pages.

## Authentication
- Passwords: PBKDF2-HMAC-SHA256 with a random salt (server). Login tokens are HMAC-signed with expiry (24 h, or 30 days with "Remember me").
- Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET|PUT /api/auth/me`, `POST /api/auth/password`. Logout clears the token in the browser.
- **Important:** on Render's free plan the disk is not persistent, so server accounts are lost when the service restarts or sleeps for long. For production use a managed database (Neon/Supabase Postgres) or a paid persistent disk (`DB_PATH`).
- If the API is unreachable, an *offline account* is created in the browser only (clearly labelled on the Profile page).

## API
`POST /api/reviews` `{content, approved_words, avoid_words, claims, palette, voice}` → `{score, passed, findings[], engine}` · `GET /api/health`

## Roadmap (Round 3)
1. Persistent Postgres database + team roles (admin / reviewer) and password reset by email
2. Image/logo asset checks and PDF/DOCX upload
3. Fact-check claims against live sources and AI rewrite suggestions
