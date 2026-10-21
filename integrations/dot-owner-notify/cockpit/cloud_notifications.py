"""KAI COCKPIT 用：dot の通知をクラウド（Cloudflare Worker）から取得してローカルにキャッシュする。

- 取得は読み取り専用トークン（COCKPIT_READ_TOKEN）だけを使う。通知の送信はできない。
- コックピットが止まっていてもLINE通知はクラウド側で続く。ここは「起動時に追いつく」ための取得だけ。
- 標準ライブラリのみ。トークンはmacOSキーチェーン（または環境変数）から読み、ログや画面には出さない。

設定（どちらか）:
  環境変数 DOT_NOTIFY_BASE_URL / DOT_NOTIFY_COCKPIT_TOKEN
  キーチェーン service="dot-owner-notify", account="BASE_URL" / "COCKPIT_READ_TOKEN"（setup-mac.sh が保存する）

単体で使う場合:
  python3 cloud_notifications.py sync   # 取得してキャッシュを更新
  python3 cloud_notifications.py list   # キャッシュの中身を新しい順に表示
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

KEYCHAIN_SERVICE = "dot-owner-notify"
DEFAULT_CACHE_PATH = Path(
    os.environ.get("DOT_NOTIFY_CACHE_PATH") or Path(__file__).resolve().parent / "cache" / "dot_notifications.json"
)
PAGE_LIMIT = 500
MAX_PAGES = 20
# 取得の境目で取りこぼさないよう、前回のサーバー時刻より少し前から取り直す（IDで重複を除く）
OVERLAP = timedelta(minutes=5)
REQUEST_TIMEOUT_SEC = 15

STATUS_LABELS = {
    "sent": "LINE送信済み（API受付・本人の受信は未確認）",
    "uncertain": "送信結果が不明（再送しない・LINEで要確認）",
    "failed": "LINE未送信（失敗）",
    "sending": "送信中",
    "stored": "保存済み（送信待ち）",
    "saved_only": "保存のみ（LINE送信なし）",
}


class CloudNotificationsError(Exception):
    """取得に失敗したときの例外。message には秘密情報を含めない。"""


def _keychain(account: str) -> str:
    if sys.platform != "darwin":
        return ""
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
            capture_output=True, text=True, timeout=10, check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def load_settings() -> tuple[str, str]:
    base_url = (os.environ.get("DOT_NOTIFY_BASE_URL") or _keychain("BASE_URL")).strip().rstrip("/")
    token = (os.environ.get("DOT_NOTIFY_COCKPIT_TOKEN") or _keychain("COCKPIT_READ_TOKEN")).strip()
    return base_url, token


def _get_json(base_url: str, token: str, path: str, params: dict[str, Any]) -> dict[str, Any]:
    query = urllib.parse.urlencode({k: v for k, v in params.items() if v not in (None, "")})
    request = urllib.request.Request(
        f"{base_url}{path}?{query}" if query else f"{base_url}{path}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SEC) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        code = "unauthorized" if error.code == 401 else f"http_{error.code}"
        raise CloudNotificationsError(code) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CloudNotificationsError("network_error") from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise CloudNotificationsError("invalid_response") from None


def _read_cache(cache_path: Path) -> dict[str, Any]:
    try:
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and isinstance(data.get("notifications"), dict):
            return data
    except (OSError, json.JSONDecodeError):
        pass
    return {"schema_version": 1, "last_server_time": None, "last_synced_at": None, "last_error": None, "notifications": {}}


def _write_cache(cache_path: Path, data: dict[str, Any]) -> None:
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=cache_path.parent, delete=False, suffix=".tmp") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=1)
        temp_name = handle.name
    os.chmod(temp_name, 0o600)
    os.replace(temp_name, cache_path)


def _since_with_overlap(last_server_time: str | None) -> str | None:
    if not last_server_time:
        return None
    try:
        parsed = datetime.fromisoformat(last_server_time.replace("Z", "+00:00"))
    except ValueError:
        return None
    return (parsed - OVERLAP).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def sync(cache_path: Path = DEFAULT_CACHE_PATH, base_url: str | None = None, token: str | None = None) -> dict[str, Any]:
    """クラウドから差分を取得してキャッシュに合流させる。戻り値は件数などの要約（秘密情報なし）。"""
    if base_url is None or token is None:
        loaded_url, loaded_token = load_settings()
        base_url = base_url or loaded_url
        token = token or loaded_token
    if not base_url or not token:
        raise CloudNotificationsError("not_configured")

    cache = _read_cache(cache_path)
    # since を必ず付けて「更新時刻の古い順」で受け取り、ページの最後の更新時刻から続きを取る
    since = _since_with_overlap(cache.get("last_server_time")) or "1970-01-01T00:00:00Z"
    fetched = 0
    changed = 0
    server_time = None
    for _ in range(MAX_PAGES):
        page = _get_json(base_url, token, "/api/notifications", {"since": since, "limit": PAGE_LIMIT})
        rows = page.get("notifications")
        if not isinstance(rows, list):
            raise CloudNotificationsError("invalid_response")
        server_time = server_time or page.get("server_time")
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("notification_id"), str):
                continue
            fetched += 1
            current = cache["notifications"].get(row["notification_id"])
            if current is None or str(row.get("updated_at", "")) >= str(current.get("updated_at", "")):
                if current != row:
                    changed += 1
                cache["notifications"][row["notification_id"]] = row
        if not page.get("has_more") or not rows:
            break
        next_since = max(str(r.get("updated_at", "")) for r in rows)
        if next_since == since:
            break  # 同じ時刻の更新が上限件数を超えた異常時。無限ループを避ける
        since = next_since

    cache["last_server_time"] = server_time or cache.get("last_server_time")
    cache["last_synced_at"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    cache["last_error"] = None
    _write_cache(cache_path, cache)
    return {"fetched": fetched, "changed": changed, "total": len(cache["notifications"]), "last_synced_at": cache["last_synced_at"]}


def sync_safely(cache_path: Path = DEFAULT_CACHE_PATH) -> dict[str, Any]:
    """コックピット起動時用。失敗しても例外を出さず、キャッシュに理由を残して要約を返す。"""
    try:
        return {"ok": True, **sync(cache_path)}
    except CloudNotificationsError as error:
        cache = _read_cache(cache_path)
        cache["last_error"] = {"code": str(error), "at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
        try:
            _write_cache(cache_path, cache)
        except OSError:
            pass
        return {"ok": False, "error": str(error), "total": len(cache["notifications"])}


def load(cache_path: Path = DEFAULT_CACHE_PATH, limit: int = 100) -> dict[str, Any]:
    """キャッシュを新しい順に返す（コックピットの画面表示用）。"""
    cache = _read_cache(cache_path)
    rows = sorted(cache["notifications"].values(), key=lambda r: str(r.get("created_at", "")), reverse=True)[:limit]
    for row in rows:
        row["status_label"] = STATUS_LABELS.get(str(row.get("status")), str(row.get("status")))
    return {
        "notifications": rows,
        "last_synced_at": cache.get("last_synced_at"),
        "last_error": cache.get("last_error"),
        "total": len(cache["notifications"]),
    }


def start_background_sync(cache_path: Path = DEFAULT_CACHE_PATH, interval_sec: int = 300) -> threading.Event:
    """コックピット起動中だけ定期的に追いつく（任意）。返した Event を set すると止まる。"""
    stop = threading.Event()

    def loop() -> None:
        while not stop.is_set():
            sync_safely(cache_path)
            stop.wait(interval_sec)

    threading.Thread(target=loop, name="dot-cloud-notifications", daemon=True).start()
    return stop


def _main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "sync"
    if command == "sync":
        result = sync_safely()
        print(json.dumps(result, ensure_ascii=False))
        return 0 if result.get("ok") else 1
    if command == "list":
        data = load(limit=30)
        print(f"最終取得: {data['last_synced_at']}  件数: {data['total']}  エラー: {data['last_error']}")
        for row in data["notifications"]:
            print(f"- {row.get('created_at')} [{row.get('status_label')}] {row.get('title')}  ({row.get('notification_id')})")
        return 0
    print("usage: cloud_notifications.py [sync|list]", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(_main(sys.argv))
