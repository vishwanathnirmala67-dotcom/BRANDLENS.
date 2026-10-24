"""BrandLens authentication (standard library only).

- Passwords: PBKDF2-HMAC-SHA256, random salt per user, constant-time compare
- Sessions: stateless HMAC-signed tokens with expiry (no extra dependency)
- Storage: SQLite (set DB_PATH to a persistent disk in production)
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
import uuid

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "brandlens.db"))
SECRET = (os.getenv("AUTH_SECRET") or secrets.token_hex(32)).encode()
ITERATIONS = 200_000
SHORT_TTL = 24 * 3600          # session without "remember me"
LONG_TTL = 30 * 24 * 3600      # "remember me"

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
TEAM_SIZES = {"", "1–10", "11–50", "51–200", "201+"}
PROFILE_FIELDS = ["full_name", "phone", "org_name", "org_email", "work_email", "industry", "team_size"]


class AuthError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            pw_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            account_type TEXT NOT NULL,
            full_name TEXT NOT NULL,
            phone TEXT DEFAULT '',
            org_name TEXT DEFAULT '',
            org_email TEXT DEFAULT '',
            work_email TEXT DEFAULT '',
            industry TEXT DEFAULT '',
            team_size TEXT DEFAULT '',
            created_at INTEGER NOT NULL,
            last_login INTEGER
        )"""
    )
    return conn


def _hash(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), ITERATIONS).hex()


def _clean(value, limit=200) -> str:
    return str(value or "").strip()[:limit]


def _valid_email(email: str) -> str:
    email = _clean(email, 254).lower()
    if not EMAIL_RE.match(email):
        raise AuthError("Please enter a valid email address.", 422)
    return email


def _valid_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 8:
        raise AuthError("Password must be at least 8 characters.", 422)
    if len(password) > 128:
        raise AuthError("Password is too long (max 128 characters).", 422)
    return password


def public_user(row: sqlite3.Row) -> dict:
    d = dict(row)
    d.pop("pw_hash", None)
    d.pop("salt", None)
    return d


# ---- tokens ------------------------------------------------------------
def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(user_id: str, remember: bool = False) -> str:
    payload = _b64(json.dumps({"uid": user_id, "exp": int(time.time()) + (LONG_TTL if remember else SHORT_TTL)}).encode())
    sig = _b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_token(token: str) -> str:
    try:
        payload, sig = token.split(".", 1)
        expected = _b64(hmac.new(SECRET, payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            raise ValueError
        data = json.loads(_unb64(payload))
        if data["exp"] < time.time():
            raise AuthError("Session expired. Please log in again.", 401)
        return data["uid"]
    except AuthError:
        raise
    except Exception:
        raise AuthError("Invalid session. Please log in again.", 401)


# ---- operations --------------------------------------------------------
def register(data: dict) -> dict:
    account_type = data.get("account_type", "individual")
    if account_type not in ("individual", "organization"):
        raise AuthError("Invalid account type.", 422)
    full_name = _clean(data.get("full_name"), 100)
    if not full_name:
        raise AuthError("Please enter your full name.", 422)
    email = _valid_email(data.get("email"))
    password = _valid_password(data.get("password"))

    org_name = org_email = work_email = industry = team_size = ""
    if account_type == "organization":
        org_name = _clean(data.get("org_name"), 120)
        if not org_name:
            raise AuthError("Please enter the organization name.", 422)
        org_email = _valid_email(data.get("org_email"))
        work_email = _valid_email(data.get("work_email"))
        industry = _clean(data.get("industry"), 80)
        team_size = _clean(data.get("team_size"), 20)
        if team_size not in TEAM_SIZES:
            raise AuthError("Invalid team size.", 422)

    salt = secrets.token_hex(16)
    user_id = uuid.uuid4().hex
    try:
        with _db() as conn:
            conn.execute(
                "INSERT INTO users (id,email,pw_hash,salt,account_type,full_name,org_name,org_email,work_email,industry,team_size,created_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (user_id, email, _hash(password, salt), salt, account_type, full_name, org_name, org_email, work_email, industry, team_size, int(time.time())),
            )
    except sqlite3.IntegrityError:
        raise AuthError("An account with this email already exists.", 409)
    return get_user(user_id)


def login(email: str, password: str, remember: bool = False) -> tuple[dict, str]:
    email = _clean(email, 254).lower()
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        # always do the hashing work so timing does not reveal if an email exists
        salt = row["salt"] if row else "00" * 16
        candidate = _hash(password or "", salt)
        if not row or not hmac.compare_digest(candidate, row["pw_hash"]):
            raise AuthError("Invalid email or password.", 401)
        conn.execute("UPDATE users SET last_login=? WHERE id=?", (int(time.time()), row["id"]))
    return get_user(row["id"]), make_token(row["id"], remember)


def get_user(user_id: str) -> dict:
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    if not row:
        raise AuthError("Account not found.", 401)
    return public_user(row)


def update_profile(user_id: str, data: dict) -> dict:
    user = get_user(user_id)
    updates: dict[str, str] = {}
    for field in PROFILE_FIELDS:
        if field not in data:
            continue
        value = _clean(data[field], 120)
        if field == "full_name" and not value:
            raise AuthError("Full name cannot be empty.", 422)
        if field in ("org_email", "work_email") and value:
            value = _valid_email(value)
        if field == "team_size" and value not in TEAM_SIZES:
            raise AuthError("Invalid team size.", 422)
        if field == "org_name" and user["account_type"] == "organization" and not value:
            raise AuthError("Organization name cannot be empty.", 422)
        if field in ("org_name", "org_email", "work_email", "industry", "team_size") and user["account_type"] != "organization":
            continue
        updates[field] = value

    new_email = data.get("email")
    if new_email is not None and _clean(new_email, 254).lower() != user["email"]:
        email = _valid_email(new_email)
        with _db() as conn:
            row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
            if not hmac.compare_digest(_hash(data.get("current_password") or "", row["salt"]), row["pw_hash"]):
                raise AuthError("Enter your current password to change your email.", 403)
        updates["email"] = email

    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        try:
            with _db() as conn:
                conn.execute(f"UPDATE users SET {sets} WHERE id=?", (*updates.values(), user_id))
        except sqlite3.IntegrityError:
            raise AuthError("That email is already used by another account.", 409)
    return get_user(user_id)


def change_password(user_id: str, current: str, new: str) -> None:
    new = _valid_password(new)
    with _db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        if not row or not hmac.compare_digest(_hash(current or "", row["salt"]), row["pw_hash"]):
            raise AuthError("Current password is incorrect.", 403)
        salt = secrets.token_hex(16)
        conn.execute("UPDATE users SET pw_hash=?, salt=? WHERE id=?", (_hash(new, salt), salt, user_id))
