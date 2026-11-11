"""HTML Tower — tiny upload service behind sn0vv.top's 技术手稿馆 (Block 08).

Public (read-only, used by the 3D building):
  GET  /tower/api/pages            -> {"pages": [...]}   newest floor last
  GET  /tower/p/<id>.html          -> the uploaded page, sandboxed by CSP

Admin (session cookie required, except login):
  GET  /tower-admin/               -> admin page (login form or manager)
  POST /tower-admin/api/login      {"password": "..."}  (5 attempts/min/IP)
  POST /tower-admin/api/logout
  GET  /tower-admin/api/session
  GET  /tower-admin/api/pages
  POST /tower-admin/api/pages      multipart: file (.html/.htm, <=5MB), title?
  PATCH  /tower-admin/api/pages/<id>  {"title": "..."}
  DELETE /tower-admin/api/pages/<id>

Only the Python standard library is used (keeps the container ~15 MB RSS).
Config (env): ADMIN_PASSWORD_HASH=scrypt:<n>:<r>:<p>:<salt-hex>:<hash-hex>,
SESSION_SECRET=<random>, DATA_DIR=/app/data, PORT=3004, PUBLIC_ORIGIN.
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import os
import re
import secrets
import threading
import time
from email import message_from_bytes
from email.policy import HTTP
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

DATA_DIR = Path(os.environ.get("DATA_DIR", "data"))
PAGES_DIR = DATA_DIR / "pages"
META_PATH = DATA_DIR / "pages.json"
PORT = int(os.environ.get("PORT", "3004"))
MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 60
MAX_TITLE = 80
SESSION_DAYS = 7
COOKIE = "tower_admin"
ADMIN_PREFIX = "/tower-admin"
PUBLIC_ORIGINS = {
    o.strip().rstrip("/")
    for o in os.environ.get("PUBLIC_ORIGIN", "https://sn0vv.top,https://www.sn0vv.top").split(",")
    if o.strip()
}
PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "").strip()
SESSION_SECRET = (os.environ.get("SESSION_SECRET") or "").encode() or secrets.token_bytes(32)
INSECURE_COOKIE = os.environ.get("INSECURE_COOKIE") == "1"  # local http testing only
PAGE_CSP = "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads"
SITE_ROOT = Path(os.environ.get("SITE_ROOT", "/site"))  # /opt/web-luodi/out mounted read-only
# 1F/2F live in the site code (public/biglink, public/lora); shown read-only in the admin list.
BUILTIN_PAGES = (
    {"floor": 1, "code": "1F", "title": "Biglink 财税多智能体系统", "path": "/biglink/index.html"},
    {"floor": 2, "code": "2F", "title": "LoRA 微调记录课堂", "path": "/lora/index.html"},
)
ID_RE = re.compile(r"^[a-f0-9]{12}$")
ADMIN_HTML = (Path(__file__).with_name("admin.html")).read_text(encoding="utf-8")

_lock = threading.Lock()
_login_attempts: dict[str, list[float]] = {}
_global_attempts: list[float] = []
LOGIN_PER_IP = 5      # per minute per client IP
LOGIN_GLOBAL = 20     # per minute overall (IP-rotating brute force)


# ---------------------------------------------------------------- storage
def load_pages() -> list[dict]:
    try:
        data = json.loads(META_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_pages(pages: list[dict]) -> None:
    tmp = META_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(pages, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, META_PATH)


def public_page(page: dict, floor: int) -> dict:
    return {
        "id": page["id"],
        "title": page["title"],
        "filename": page["filename"],
        "size": page["size"],
        "createdAt": page["createdAt"],
        "floor": floor,
        "url": f"/tower/p/{page['id']}.html",
    }


def builtin_listing() -> list[dict]:
    out = []
    for item in BUILTIN_PAGES:
        file = SITE_ROOT / item["path"].lstrip("/")
        try:
            st = file.stat()
            size, created = st.st_size, time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(st.st_mtime))
        except OSError:
            size, created = None, None
        out.append({
            "id": f"builtin-{item['floor']}",
            "builtin": True,
            "title": item["title"],
            "filename": item["path"].lstrip("/"),
            "size": size,
            "createdAt": created,
            "floor": item["floor"],
            "code": item["code"],
            "url": item["path"],
        })
    return out


def listing() -> list[dict]:
    return [public_page(p, i + 1) for i, p in enumerate(load_pages())]


# ---------------------------------------------------------------- auth
def hash_password(password: str, n: int = 2**14, r: int = 8, p: int = 1) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)
    return f"scrypt:{n}:{r}:{p}:{salt.hex()}:{digest.hex()}"


def verify_password(password: str) -> bool:
    try:
        algo, n, r, p, salt, expected = PASSWORD_HASH.replace("$", ":").split(":")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=int(n), r=int(r), p=int(p),
            dklen=len(expected) // 2, maxmem=64 * 1024 * 1024,
        )
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def sign_session(expiry: int) -> str:
    nonce = secrets.token_hex(8)
    body = f"{expiry}.{nonce}"
    mac = hmac.new(SESSION_SECRET, body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{mac}"


def session_valid(value: str | None) -> bool:
    if not value:
        return False
    try:
        expiry, nonce, mac = value.split(".")
        good = hmac.new(SESSION_SECRET, f"{expiry}.{nonce}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(mac, good) and int(expiry) > time.time()
    except ValueError:
        return False


def login_allowed(ip: str) -> bool:
    now = time.time()
    with _lock:
        recent = [t for t in _login_attempts.get(ip, []) if now - t < 60]
        if len(_login_attempts) > 5000:
            _login_attempts.clear()
        _global_attempts[:] = [t for t in _global_attempts if now - t < 60]
        if len(recent) >= LOGIN_PER_IP or len(_global_attempts) >= LOGIN_GLOBAL:
            _login_attempts[ip] = recent
            return False
        recent.append(now)
        _global_attempts.append(now)
        _login_attempts[ip] = recent
        return True


# ---------------------------------------------------------------- upload helpers
TITLE_RE = re.compile(rb"<title[^>]*>(.*?)</title>", re.I | re.S)


def clean_title(raw: str) -> str:
    title = re.sub(r"\s+", " ", html.unescape(raw)).strip()
    title = "".join(ch for ch in title if ch.isprintable())
    return title[:MAX_TITLE]


def decode_html(body: bytes) -> str | None:
    if b"\x00" in body[:4096]:
        return None
    for enc in ("utf-8-sig", "gb18030"):
        try:
            return body.decode(enc)
        except UnicodeDecodeError:
            continue
    return None


def parse_multipart(content_type: str, body: bytes) -> dict[str, tuple[str | None, bytes]]:
    msg = message_from_bytes(
        b"Content-Type: " + content_type.encode("latin-1") + b"\r\nMIME-Version: 1.0\r\n\r\n" + body,
        policy=HTTP,
    )
    fields: dict[str, tuple[str | None, bytes]] = {}
    if not msg.is_multipart():
        return fields
    for part in msg.iter_parts():
        name = part.get_param("name", header="content-disposition")
        if not name:
            continue
        payload = part.get_payload(decode=True) or b""
        fields[str(name)] = (part.get_filename(), payload)
    return fields


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "HtmlTower/1.0"
    sys_version = ""

    # quiet, no bodies/passwords ever logged
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        print(f"{self.client_ip()} {self.command} {urlsplit(self.path).path} {args[1] if len(args) > 1 else ''}", flush=True)

    def client_ip(self) -> str:
        return (self.headers.get("X-Real-IP") or self.client_address[0]).strip()

    # ---- responses
    def send_json(self, status: int, payload: object, extra: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def error(self, status: int, zh: str, en: str) -> None:
        self.send_json(status, {"error": zh, "errorEn": en})

    def cookie(self) -> str | None:
        raw = self.headers.get("Cookie") or ""
        for part in raw.split(";"):
            k, _, v = part.strip().partition("=")
            if k == COOKIE:
                return v
        return None

    def authed(self) -> bool:
        return session_valid(self.cookie())

    def same_origin(self) -> bool:
        origin = self.headers.get("Origin")
        if not origin:
            return True  # non-browser clients (curl); cookie is SameSite=Strict anyway
        host = self.headers.get("Host", "")
        return origin.rstrip("/") in PUBLIC_ORIGINS or urlsplit(origin).netloc == host

    def read_body(self, limit: int) -> bytes | None:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length < 0 or length > limit:
            return None
        return self.rfile.read(length) if length else b""

    # ---- routing
    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path in ("/tower/api/pages", "/tower/api/pages/"):
            return self.send_json(200, {"pages": listing()}, {"Cache-Control": "no-cache"})
        m = re.fullmatch(r"/tower/p/([a-f0-9]{12})\.html", path)
        if m:
            return self.serve_page(m.group(1))
        if path == "/tower/healthz":
            return self.send_json(200, {"ok": True})
        if path in (ADMIN_PREFIX, ADMIN_PREFIX + "/"):
            if path == ADMIN_PREFIX:
                self.send_response(301)
                self.send_header("Location", ADMIN_PREFIX + "/")
                self.end_headers()
                return
            return self.serve_admin()
        if path == ADMIN_PREFIX + "/api/session":
            return self.send_json(200, {"authenticated": self.authed()})
        if path == ADMIN_PREFIX + "/api/pages":
            if not self.authed():
                return self.error(401, "请先登录", "Please log in")
            return self.send_json(200, {"pages": listing(), "builtin": builtin_listing()})
        self.error(404, "未找到", "Not found")

    def do_POST(self) -> None:
        path = urlsplit(self.path).path
        if not path.startswith(ADMIN_PREFIX + "/api/"):
            return self.error(404, "未找到", "Not found")
        if not self.same_origin():
            return self.error(403, "来源不被允许", "Cross-origin request refused")
        if path == ADMIN_PREFIX + "/api/login":
            return self.login()
        if path == ADMIN_PREFIX + "/api/logout":
            return self.send_json(200, {"ok": True}, {"Set-Cookie": self.cookie_header("", 0)})
        if path == ADMIN_PREFIX + "/api/pages":
            if not self.authed():
                return self.error(401, "请先登录", "Please log in")
            return self.upload()
        self.error(404, "未找到", "Not found")

    def do_PATCH(self) -> None:
        page_id = self.admin_page_id()
        if not page_id:
            return
        body = self.read_body(4096)
        try:
            title = clean_title(str(json.loads(body or b"{}").get("title", "")))
        except (json.JSONDecodeError, AttributeError):
            title = ""
        if not title:
            return self.error(400, "标题不能为空", "Title required")
        with _lock:
            pages = load_pages()
            for p in pages:
                if p["id"] == page_id:
                    p["title"] = title
                    save_pages(pages)
                    return self.send_json(200, {"page": p})
        self.error(404, "页面不存在", "Page not found")

    def do_DELETE(self) -> None:
        page_id = self.admin_page_id()
        if not page_id:
            return
        with _lock:
            pages = load_pages()
            remaining = [p for p in pages if p["id"] != page_id]
            if len(remaining) == len(pages):
                return self.error(404, "页面不存在", "Page not found")
            save_pages(remaining)
            (PAGES_DIR / f"{page_id}.html").unlink(missing_ok=True)
        self.send_json(200, {"ok": True, "pages": listing()})

    def admin_page_id(self) -> str | None:
        path = urlsplit(self.path).path
        m = re.fullmatch(ADMIN_PREFIX + r"/api/pages/([a-f0-9]{12})", path)
        if not m:
            self.error(404, "未找到", "Not found")
            return None
        if not self.same_origin():
            self.error(403, "来源不被允许", "Cross-origin request refused")
            return None
        if not self.authed():
            self.error(401, "请先登录", "Please log in")
            return None
        return m.group(1)

    # ---- handlers
    def cookie_header(self, value: str, max_age: int) -> str:
        secure = "" if INSECURE_COOKIE else "; Secure"
        return f"{COOKIE}={value}; Max-Age={max_age}; Path={ADMIN_PREFIX}; HttpOnly; SameSite=Strict{secure}"

    def login(self) -> None:
        if not login_allowed(self.client_ip()):
            return self.send_json(
                429, {"error": "尝试太频繁，请一分钟后再试", "errorEn": "Too many attempts, wait a minute"},
                {"Retry-After": "60"},
            )
        body = self.read_body(4096)
        try:
            password = str(json.loads(body or b"{}").get("password", ""))
        except (json.JSONDecodeError, AttributeError):
            password = ""
        if not PASSWORD_HASH or not password or not verify_password(password):
            time.sleep(0.4)
            return self.error(401, "密码不正确", "Wrong password")
        max_age = SESSION_DAYS * 86400
        token = sign_session(int(time.time()) + max_age)
        self.send_json(200, {"ok": True}, {"Set-Cookie": self.cookie_header(token, max_age)})

    def upload(self) -> None:
        ctype = self.headers.get("Content-Type", "")
        if not ctype.startswith("multipart/form-data"):
            return self.error(400, "请用表单上传文件", "multipart/form-data expected")
        body = self.read_body(MAX_BYTES + 64 * 1024)
        if body is None:
            return self.error(413, "文件不能超过 5MB", "File larger than 5 MB")
        fields = parse_multipart(ctype, body)
        filename, content = fields.get("file", (None, b""))
        filename = os.path.basename(filename or "")
        if not filename or not re.search(r"\.html?$", filename, re.I):
            return self.error(400, "只能上传 .html / .htm 文件", "Only .html / .htm files")
        if not content:
            return self.error(400, "文件是空的", "File is empty")
        if len(content) > MAX_BYTES:
            return self.error(413, "文件不能超过 5MB", "File larger than 5 MB")
        text = decode_html(content)
        if text is None:
            return self.error(400, "文件不是文本 HTML", "Not a text HTML file")
        given = clean_title(fields.get("title", (None, b""))[1].decode("utf-8", "ignore"))
        m = TITLE_RE.search(content[:200_000])
        found = clean_title(m.group(1).decode("utf-8", "ignore")) if m else ""
        title = given or found or clean_title(re.sub(r"\.html?$", "", filename, flags=re.I)) or "Untitled"
        with _lock:
            pages = load_pages()
            if len(pages) >= MAX_PAGES:
                return self.error(409, f"最多 {MAX_PAGES} 层，请先删除旧页面", f"Tower is full ({MAX_PAGES} floors)")
            page_id = secrets.token_hex(6)
            (PAGES_DIR / f"{page_id}.html").write_text(text, encoding="utf-8")
            page = {
                "id": page_id,
                "title": title,
                "filename": filename[:120],
                "size": len(content),
                "createdAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
            }
            pages.append(page)
            save_pages(pages)
            floor = len(pages)
        self.send_json(201, {"page": public_page(page, floor)})

    def serve_page(self, page_id: str) -> None:
        file = PAGES_DIR / f"{page_id}.html"
        if not ID_RE.match(page_id) or not file.is_file():
            return self.error(404, "页面不存在", "Page not found")
        body = file.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Content-Security-Policy", PAGE_CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cache-Control", "public, max-age=60")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def serve_admin(self) -> None:
        body = ADMIN_HTML.encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
            "img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        )
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)


def main() -> None:
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "hash":
        print(hash_password(sys.stdin.readline().rstrip("\n")))
        return
    PAGES_DIR.mkdir(parents=True, exist_ok=True)
    if not PASSWORD_HASH:
        print("WARNING: ADMIN_PASSWORD_HASH not set — admin login disabled", flush=True)
    ThreadingHTTPServer.daemon_threads = True
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"html-tower listening on :{PORT}, {len(load_pages())} pages", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
