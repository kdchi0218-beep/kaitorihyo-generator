"""cloud_notifications.py の単体テスト（ページ送り・差分合流・認証エラー）。

実行: python3 -m unittest test_cloud_notifications.py
"""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import cloud_notifications as cn

TOKEN = "cockpit-test-token-0123456789abcdef"


def make_rows(count: int, start: int = 0) -> list[dict]:
    return [
        {
            "notification_id": f"n:{i:04d}",
            "title": f"通知{i}",
            "status": "sent",
            "created_at": f"2026-10-21T00:{i // 60 % 60:02d}:{i % 60:02d}.000Z",
            "updated_at": f"2026-10-21T00:{i // 60 % 60:02d}:{i % 60:02d}.000Z",
        }
        for i in range(start, start + count)
    ]


class StubHandler(BaseHTTPRequestHandler):
    rows: list[dict] = []
    seen_auth: list[str] = []

    def log_message(self, *_args):  # テスト出力を汚さない
        pass

    def do_GET(self):  # noqa: N802
        StubHandler.seen_auth.append(self.headers.get("Authorization", ""))
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_response(401)
            self.end_headers()
            self.wfile.write(b'{"error":"unauthorized"}')
            return
        query = parse_qs(urlparse(self.path).query)
        since = query.get("since", [""])[0]
        limit = int(query.get("limit", ["200"])[0])
        matched = sorted((r for r in StubHandler.rows if r["updated_at"] >= since), key=lambda r: (r["updated_at"], r["notification_id"]))
        body = {"server_time": "2026-10-21T09:00:00.000Z", "notifications": matched[:limit], "has_more": len(matched) > limit}
        payload = json.dumps(body).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(payload)


class CloudNotificationsTest(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), StubHandler)
        self.base = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.tmp = tempfile.TemporaryDirectory()
        self.cache = Path(self.tmp.name) / "cache.json"
        StubHandler.rows = make_rows(1203)
        StubHandler.seen_auth = []

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.tmp.cleanup()

    def test_paginates_all_rows_and_merges_without_duplicates(self):
        result = cn.sync(self.cache, base_url=self.base, token=TOKEN)
        self.assertEqual(result["total"], 1203)
        self.assertTrue(all(auth == f"Bearer {TOKEN}" for auth in StubHandler.seen_auth))
        self.assertGreaterEqual(len(StubHandler.seen_auth), 3)

        StubHandler.rows[0] = {**StubHandler.rows[0], "status": "uncertain", "updated_at": "2026-10-21T08:59:00.000Z"}
        again = cn.sync(self.cache, base_url=self.base, token=TOKEN)
        self.assertEqual(again["total"], 1203)
        self.assertEqual(again["changed"], 1)
        data = cn.load(self.cache, limit=2000)
        updated = next(r for r in data["notifications"] if r["notification_id"] == "n:0000")
        self.assertEqual(updated["status"], "uncertain")
        self.assertIn("再送しない", updated["status_label"])
        self.assertNotIn(TOKEN, self.cache.read_text(encoding="utf-8"))

    def test_unauthorized_keeps_cache_and_records_error(self):
        cn.sync(self.cache, base_url=self.base, token=TOKEN)
        with self.assertRaises(cn.CloudNotificationsError) as raised:
            cn.sync(self.cache, base_url=self.base, token="wrong-token-wrong-token")
        self.assertEqual(str(raised.exception), "unauthorized")
        self.assertEqual(cn.load(self.cache)["total"], 1203)

    def test_not_configured(self):
        with self.assertRaises(cn.CloudNotificationsError) as raised:
            cn.sync(self.cache, base_url="", token="")
        self.assertEqual(str(raised.exception), "not_configured")

    def test_network_error_is_reported_safely(self):
        with self.assertRaises(cn.CloudNotificationsError) as raised:
            cn.sync(self.cache, base_url="http://127.0.0.1:9", token=TOKEN)
        self.assertEqual(str(raised.exception), "network_error")


if __name__ == "__main__":
    unittest.main()
