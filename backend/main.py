import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import auth
import engine

app = FastAPI(title="BrandLens API", version="3.0.0")

DEFAULT_ORIGINS = "https://anjalisaxena13.github.io,https://vishwanathnirmala67-dotcom.github.io,http://localhost:5173,http://127.0.0.1:5173"
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type", "Authorization"],
)

# --- tiny in-memory rate limiter (per IP, separate buckets) ---------------
LIMITS = {
    "/api/auth": int(os.getenv("AUTH_RATE_PER_MIN", "20")),
    "/api/reviews": int(os.getenv("RATE_LIMIT_PER_MIN", "30")),
}
_hits: dict[tuple, deque] = defaultdict(deque)


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    for prefix, limit in LIMITS.items():
        if request.url.path.startswith(prefix) and request.method != "OPTIONS":
            ip = request.client.host if request.client else "unknown"
            now = time.time()
            q = _hits[(prefix, ip)]
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= limit:
                return JSONResponse({"detail": "Too many requests. Please wait a minute."}, status_code=429)
            q.append(now)
    return await call_next(request)


@app.exception_handler(auth.AuthError)
async def auth_error_handler(_: Request, exc: auth.AuthError):
    return JSONResponse({"detail": exc.message}, status_code=exc.status)


def current_user_id(authorization: str = Header(default="")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise auth.AuthError("Please log in.", 401)
    return auth.verify_token(authorization[7:].strip())


# --- models --------------------------------------------------------------
class Voice(BaseModel):
    name: str = ""
    audience: str = ""
    tone: str = ""
    style: str = ""


class ReviewRequest(BaseModel):
    content: str = Field(min_length=1, max_length=10000)
    approved_words: list[str] | str = []
    avoid_words: list[str] | str = []   # supports "cheap => affordable"
    claims: str = Field(default="", max_length=5000)  # one per line: "fact | source"
    palette: list[str] | str = []       # approved hex colours
    voice: Voice = Voice()


class RegisterRequest(BaseModel):
    account_type: str = "individual"
    full_name: str = Field(max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)
    org_name: str = ""
    org_email: str = ""
    work_email: str = ""
    industry: str = ""
    team_size: str = ""


class LoginRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)
    remember: bool = False


class ProfileUpdate(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    org_name: str | None = None
    org_email: str | None = None
    work_email: str | None = None
    industry: str | None = None
    team_size: str | None = None
    email: str | None = None
    current_password: str | None = None


class PasswordChange(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


# --- routes --------------------------------------------------------------
@app.get("/")
def home():
    return {"message": "BrandLens API is running", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {
        "status": "online",
        "product": "BrandLens",
        "version": app.version,
        "ai_tone_check": bool(os.getenv("ANTHROPIC_API_KEY")),
        "auth": True,
    }


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterRequest):
    user = auth.register(body.model_dump())
    return {"user": user}


@app.post("/api/auth/login")
def login(body: LoginRequest):
    user, token = auth.login(body.email, body.password, body.remember)
    return {"user": user, "token": token}


@app.get("/api/auth/me")
def me(authorization: str = Header(default="")):
    return {"user": auth.get_user(current_user_id(authorization))}


@app.put("/api/auth/me")
def update_me(body: ProfileUpdate, authorization: str = Header(default="")):
    uid = current_user_id(authorization)
    return {"user": auth.update_profile(uid, body.model_dump(exclude_unset=True))}


@app.post("/api/auth/password")
def change_password(body: PasswordChange, authorization: str = Header(default="")):
    uid = current_user_id(authorization)
    auth.change_password(uid, body.current_password, body.new_password)
    return {"ok": True}


@app.post("/api/reviews")
def review_content(request: ReviewRequest):
    if not request.content.strip():
        raise HTTPException(status_code=422, detail="Content is empty.")
    result = engine.review(request.model_dump())
    result["content"] = request.content
    return result
