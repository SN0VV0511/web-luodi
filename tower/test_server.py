"""Run: python3 -m unittest tower/test_server.py  (stdlib only)."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import server  # noqa: E402


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class TowerServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.port = free_port()
        env = dict(os.environ, DATA_DIR=cls.tmp.name, PORT=str(cls.port), INSECURE_COOKIE="1",
                   SESSION_SECRET="test", ADMIN_PASSWORD_HASH=server.hash_password("correct horse"))
        cls.proc = subprocess.Popen([sys.executable, str(HERE / "server.py")], env=env,
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try:
                urllib.request.urlopen(cls.url("/tower/healthz"))
                break
            except OSError:
                time.sleep(0.1)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()
        cls.proc.wait()
        cls.tmp.cleanup()

    @classmethod
    def url(cls, path):
        return f"http://127.0.0.1:{cls.port}{path}"

    def req(self, method, path, body=None, headers=None):
        r = urllib.request.Request(self.url(path), data=body, method=method, headers=headers or {})
        try:
            with urllib.request.urlopen(r) as res:
                return res.status, dict(res.headers), res.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def login(self, password="correct horse"):
        return self.req("POST", "/tower-admin/api/login", json.dumps({"password": password}).encode(),
                        {"Content-Type": "application/json"})

    def multipart(self, filename, content, title=""):
        b = uuid.uuid4().hex
        parts = [f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: text/html\r\n\r\n'.encode() + content + b"\r\n"]
        if title:
            parts.append(f'--{b}\r\nContent-Disposition: form-data; name="title"\r\n\r\n{title}\r\n'.encode())
        return b"".join(parts) + f"--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}"

    def test_flow(self):
        body, ctype = self.multipart("a.html", b"<title>Hi</title><h1>x</h1>")
        status, _, _ = self.req("POST", "/tower-admin/api/pages", body, {"Content-Type": ctype})
        self.assertEqual(status, 401)
        self.assertEqual(self.login("wrong")[0], 401)
        status, headers, _ = self.login()
        self.assertEqual(status, 200)
        cookie = headers["Set-Cookie"]
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Strict", cookie)
        auth = {"Cookie": cookie.split(";")[0], "Content-Type": ctype}
        status, _, raw = self.req("POST", "/tower-admin/api/pages", body, auth)
        self.assertEqual(status, 201)
        page = json.loads(raw)["page"]
        self.assertEqual(page["title"], "Hi")
        status, _, _ = self.req("POST", "/tower-admin/api/pages", body, {**auth, "Origin": "https://evil.example"})
        self.assertEqual(status, 403)
        bad, bad_type = self.multipart("a.txt", b"hi")
        self.assertEqual(self.req("POST", "/tower-admin/api/pages", bad, {**auth, "Content-Type": bad_type})[0], 400)
        status, headers, html = self.req("GET", page["url"])
        self.assertEqual(status, 200)
        self.assertTrue(headers["Content-Security-Policy"].startswith("sandbox"))
        self.assertNotIn("allow-same-origin", headers["Content-Security-Policy"])
        self.assertEqual(headers["X-Content-Type-Options"], "nosniff")
        listed = json.loads(self.req("GET", "/tower/api/pages")[2])["pages"]
        self.assertEqual([p["id"] for p in listed], [page["id"]])
        self.assertEqual(self.req("DELETE", f"/tower-admin/api/pages/{page['id']}")[0], 401)
        self.assertEqual(self.req("DELETE", f"/tower-admin/api/pages/{page['id']}", None, {"Cookie": auth["Cookie"]})[0], 200)
        self.assertEqual(self.req("GET", page["url"])[0], 404)
        status, headers, _ = self.req("GET", "/tower-admin/")
        self.assertEqual(headers["X-Robots-Tag"], "noindex, nofollow")

    def test_rate_limit(self):
        codes = [self.req("POST", "/tower-admin/api/login", b'{"password":"x"}',
                          {"Content-Type": "application/json", "X-Real-IP": "203.0.113.9"})[0] for _ in range(6)]
        self.assertEqual(codes[-1], 429)


if __name__ == "__main__":
    unittest.main()
