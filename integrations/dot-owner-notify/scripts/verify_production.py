#!/usr/bin/env python3
"""本番の dot-owner-notify を確認する（Macで実行。値はキーチェーンから読み、画面に出さない）。

  python3 verify_production.py                 # 送信しない確認だけ（認証・MCP・GASの本人限定設定・読み戻し）
  python3 verify_production.py --send-test     # 本人宛ての無害なテスト通知を1通送り、重複防止と読み戻しも確認
  python3 verify_production.py --configure-gas # GASの本人限定配信を有効化（宛先が1名のときだけ・確認つき）

結果の見方:
  「LINE API受付」は GAS→LINE API が成功したという意味で、本人の受信確認ではありません。
  最後に表示される質問に、LINEで実際に届いたかを答えてください（記録はこの画面だけ）。
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SERVICE = "dot-owner-notify"
GAS_URL_PATTERN = re.compile(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,200}/exec")


def keychain(account: str) -> str:
    env_name = {"BASE_URL": "DOT_NOTIFY_BASE_URL", "COCKPIT_READ_TOKEN": "DOT_NOTIFY_COCKPIT_TOKEN"}.get(account, account)
    if os.environ.get(env_name):
        return os.environ[env_name].strip()
    result = subprocess.run(["security", "find-generic-password", "-s", SERVICE, "-a", account, "-w"],
                            capture_output=True, text=True, check=False)
    return result.stdout.strip() if result.returncode == 0 else ""


def http(method: str, url: str, token: str = "", body: dict | None = None, form: dict | None = None) -> tuple[int, dict, dict]:
    headers = {"Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    if form is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urllib.parse.urlencode(form).encode()
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            raw = response.read().decode("utf-8")
            return response.status, dict(response.headers), (json.loads(raw) if raw.strip().startswith(("{", "[")) else {"text": raw})
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            parsed = {"text": raw[:200]}
        return error.code, dict(error.headers), parsed


class Checker:
    def __init__(self) -> None:
        self.failed = 0

    def check(self, label: str, ok: bool, detail: str = "") -> bool:
        mark = "✓" if ok else "✖"
        print(f"  {mark} {label}" + (f" — {detail}" if detail else ""))
        if not ok:
            self.failed += 1
        return ok


def mcp_call(base: str, token: str, method: str, params: dict | None = None, rpc_id: list[int] = [0]) -> dict:
    rpc_id[0] += 1
    status, _, body = http("POST", f"{base}/mcp", token, {"jsonrpc": "2.0", "id": rpc_id[0], "method": method, "params": params or {}})
    if status != 200:
        raise RuntimeError(f"MCP {method} が HTTP {status} を返しました")
    return body


def tool(base: str, token: str, name: str, arguments: dict) -> dict:
    body = mcp_call(base, token, "tools/call", {"name": name, "arguments": arguments})
    return body.get("result", {})


def configure_gas(c: Checker) -> None:
    print("\n■ GASの本人限定配信の有効化（push_brief_v2_configure）")
    gas_url = os.environ.get("GAS_EXEC_URL") or input("  GASの本番ウェブアプリURL（…/exec）: ").strip()
    if not GAS_URL_PATTERN.fullmatch(gas_url):
        c.check("GASのURL形式", False, "…/exec で終わる本番URLを指定してください")
        return
    api_key = os.environ.get("GAS_API_KEY") or getpass.getpass("  GASのAPI_KEY（表示されません）: ")
    status, _, body = http("POST", gas_url, form={"action": "push_brief_v2_status", "key": api_key})
    result = body.get("result") or {}
    if not c.check("GASの状態取得", body.get("status") == "ok", f"code={body.get('code')}" if body.get("status") != "ok" else ""):
        return
    print(f"    宛先数(ownerCount)={result.get('ownerCount')} / 準備完了(configReady)={result.get('configReady')} / LINEトークン={result.get('tokenPresent')}")
    if result.get("configReady") and result.get("ownerCount") == 1:
        c.check("既に本人限定配信は有効です", True)
        return
    if result.get("ownerCount") != 1:
        c.check("宛先が1名ではないため、有効化しません", False,
                "既存のオーナー設定は変えずに止めます。README の「宛先が1名でない場合」を参照してください")
        return
    answer = input("  宛先1名（本人）で push_brief_v2 を有効化します。よろしいですか？ [y/N]: ").strip().lower()
    if answer != "y":
        print("  中止しました。")
        return
    status, _, body = http("POST", gas_url, form={"action": "push_brief_v2_configure", "key": api_key})
    result = body.get("result") or {}
    c.check("有効化", body.get("status") == "ok" and result.get("configReady") is True,
            f"ownerCount={result.get('ownerCount')} configReady={result.get('configReady')}")


def main() -> int:
    parser = argparse.ArgumentParser(description="dot-owner-notify 本番確認")
    parser.add_argument("--send-test", action="store_true", help="本人宛てのテスト通知を1通送る")
    parser.add_argument("--configure-gas", action="store_true", help="GASの本人限定配信を有効化する（確認つき）")
    args = parser.parse_args()
    c = Checker()

    if args.configure_gas:
        configure_gas(c)
        return 1 if c.failed else 0

    base = keychain("BASE_URL").rstrip("/")
    static_token = keychain("MCP_STATIC_TOKEN")
    cockpit_token = keychain("COCKPIT_READ_TOKEN")
    if not (base and static_token and cockpit_token):
        print("キーチェーンに設定がありません。先に setup-mac.sh を実行してください。")
        return 1
    print(f"対象: {base}")

    print("\n■ 公開面と認証")
    status, _, _ = http("GET", f"{base}/health")
    c.check("生存確認 /health", status == 200)
    status, headers, _ = http("POST", f"{base}/mcp", body={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    www = headers.get("WWW-Authenticate") or headers.get("Www-Authenticate") or ""
    c.check("トークンなしのMCPは401", status == 401 and "resource_metadata" in www)
    status, _, _ = http("GET", f"{base}/api/notifications")
    c.check("トークンなしのコックピットAPIは401", status == 401)
    status, _, meta = http("GET", f"{base}/.well-known/oauth-authorization-server")
    c.check("OAuthメタデータ公開（ChatGPT用）", status == 200 and meta.get("issuer") == base)

    print("\n■ MCP（dotが使う操作）")
    init = mcp_call(base, static_token, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                                     "clientInfo": {"name": "verify_production", "version": "1"}})
    c.check("initialize", "result" in init, init.get("result", {}).get("protocolVersion", ""))
    tools = [t["name"] for t in mcp_call(base, static_token, "tools/list").get("result", {}).get("tools", [])]
    c.check("操作は4つだけ", sorted(tools) == ["get_notification", "get_notify_status", "list_notifications", "notify_owner"], ", ".join(tools))

    print("\n■ GASの本人限定設定（push_brief_v2_status）")
    status_result = tool(base, static_token, "get_notify_status", {}).get("structuredContent", {})
    gas = status_result.get("gas_owner_only", {})
    print(f"    GAS到達={gas.get('reachable')} 宛先数={gas.get('ownerCount')} 準備完了={gas.get('configReady')} "
          f"LINEトークン={gas.get('tokenPresent')} エラー={gas.get('error')}")
    owner_ready = c.check("本人1名だけに送れる状態", gas.get("ownerOnlyReady") is True,
                          "" if gas.get("ownerOnlyReady") else "--configure-gas で有効化（宛先1名のときだけ）")

    if args.send_test:
        print("\n■ 本人宛てテスト通知")
        if not owner_ready:
            print("  本人限定の準備ができていないため送りません。")
        else:
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            notification = {
                "notification_id": f"test:setup:{stamp}",
                "title": "【テスト】dot通知の接続確認",
                "body": "これは dot → Aimo公式LINE の通知経路の接続テストです。対応は不要です。",
                "category": "other",
                "severity": "info",
            }
            first = tool(base, static_token, "notify_owner", notification).get("structuredContent", {})
            c.check("LINE API受付（GAS経由・本人1名宛て）", first.get("delivery") == "sent",
                    f"delivery={first.get('delivery')} detail={first.get('notification', {}).get('status_detail')}")
            again = tool(base, static_token, "notify_owner", notification).get("structuredContent", {})
            c.check("同じIDの再呼び出しは再送しない", again.get("delivery") == "already_sent", f"delivery={again.get('delivery')}")
            detail = tool(base, static_token, "get_notification", {"notification_id": notification["notification_id"]})
            saved = detail.get("structuredContent", {}).get("notification", {})
            c.check("MCPで読み戻し", saved.get("title") == notification["title"], f"試行{len(saved.get('attempts', []))}回")
            status, _, body = http("GET", f"{base}/api/notifications/{urllib.parse.quote(notification['notification_id'], safe='')}", cockpit_token)
            c.check("コックピットAPIで読み戻し", status == 200 and body.get("notification", {}).get("status") == "sent")

    print("\n■ コックピット取得（cloud_notifications.py）")
    module = Path(__file__).resolve().parent.parent / "cockpit" / "cloud_notifications.py"
    run = subprocess.run([sys.executable, str(module), "sync"], capture_output=True, text=True, check=False)
    try:
        summary = json.loads(run.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        summary = {"ok": False, "error": "no_output"}
    c.check("クラウドから取得してキャッシュ", summary.get("ok") is True, f"total={summary.get('total')} error={summary.get('error')}")

    print("\n結果:", "すべて成功" if c.failed == 0 else f"{c.failed}件の失敗があります")
    if args.send_test and owner_ready:
        print("\n※ ここまでの「成功」はAPIの成功です。本人の受信確認ではありません。")
        answer = input("  Aimo公式LINEに【テスト】dot通知の接続確認 が届きましたか？ [y/N]: ").strip().lower()
        print("  → 本人の受信を確認しました。" if answer == "y" else "  → 本人の受信は未確認です（LINEのトーク画面を確認してください）。")
    return 1 if c.failed else 0


if __name__ == "__main__":
    sys.exit(main())
