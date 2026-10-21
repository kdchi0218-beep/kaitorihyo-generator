#!/usr/bin/env bash
# dot → 本人LINE通知の中継（Cloudflare Worker）を、Macから1回だけ配備する。
# 以後の通知・保存はクラウドで動くので、Macを閉じていても止まらない。
#
# 使い方（Mycompany-v2 側でGASの値を環境変数に入れてから実行すると入力を省ける）:
#   GAS_EXEC_URL='https://script.google.com/macros/s/…/exec' GAS_API_KEY='…' ./setup-mac.sh
#   値が未設定なら、その場で入力を求める（API_KEYは画面に表示しない）。
#
# 秘密情報の扱い:
#   - 接続コード・コックピット用トークン・検証用トークンはこのMacで生成し、キーチェーン
#     （サービス名 dot-owner-notify）に保存してから `wrangler secret put` に標準入力で渡す。
#   - どの値も画面・ログ・Gitには出さない。

set -euo pipefail

SERVICE="dot-owner-notify"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$SCRIPT_DIR/../worker"
export WRANGLER_SEND_METRICS=false

say() { printf '\n▶ %s\n' "$1"; }
die() { printf '\n✖ %s\n' "$1" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 が見つかりません。インストールしてから再実行してください。"; }

kc_get() { security find-generic-password -s "$SERVICE" -a "$1" -w 2>/dev/null || true; }
kc_set() { security add-generic-password -U -s "$SERVICE" -a "$1" -w "$2" >/dev/null; }
new_secret() { python3 -c 'import secrets; print(secrets.token_urlsafe(32))'; }

need node
need npx
need python3
need security

cd "$WORKER_DIR"

say "依存パッケージを入れます"
npm install --no-audit --no-fund >/dev/null

say "Cloudflareのログインを確認します"
if ! npx wrangler whoami >/dev/null 2>&1; then
  npx wrangler login
fi

say "保存用データベース（D1: dot-owner-notify）を用意します"
find_db_id() {
  npx wrangler d1 list --json 2>/dev/null | python3 -c '
import json, sys
try:
    rows = json.load(sys.stdin)
except Exception:
    rows = []
print(next((r.get("uuid", "") for r in rows if r.get("name") == "dot-owner-notify"), ""))'
}
DB_ID="$(find_db_id)"
if [ -z "$DB_ID" ]; then
  npx wrangler d1 create dot-owner-notify >/dev/null
  DB_ID="$(find_db_id)"
fi
[ -n "$DB_ID" ] || die "D1データベースのIDを取得できませんでした。"
python3 - "$DB_ID" <<'PY'
import re, sys, pathlib
path = pathlib.Path("wrangler.toml")
text = path.read_text(encoding="utf-8")
text = re.sub(r'^database_id = ".*"$', f'database_id = "{sys.argv[1]}"', text, count=1, flags=re.M)
path.write_text(text, encoding="utf-8")
PY
npx wrangler d1 migrations apply OWNER_NOTIFY_DB --remote

say "Workerを配備します"
DEPLOY_LOG="$(mktemp)"
trap 'rm -f "$DEPLOY_LOG"' EXIT
npx wrangler deploy 2>&1 | tee "$DEPLOY_LOG" | grep -E "https://|Uploaded|Deployed" || true
BASE_URL="$(grep -Eo 'https://dot-owner-notify\.[A-Za-z0-9-]+\.workers\.dev' "$DEPLOY_LOG" | head -1 || true)"
[ -n "$BASE_URL" ] || die "配備先URLを読み取れませんでした（上の出力を確認してください）。"
kc_set BASE_URL "$BASE_URL"

say "接続コード・コックピット用トークン・検証用トークンを用意します（キーチェーンに保存）"
for NAME in DOT_CONNECT_CODE COCKPIT_READ_TOKEN MCP_STATIC_TOKEN; do
  VALUE="$(kc_get "$NAME")"
  if [ -z "$VALUE" ]; then
    VALUE="$(new_secret)"
    kc_set "$NAME" "$VALUE"
  fi
  printf '%s' "$VALUE" | npx wrangler secret put "$NAME" >/dev/null
  unset VALUE
  echo "  ✓ $NAME"
done

say "既存GAS（AI秘書公式LINE）の接続情報を登録します"
GAS_EXEC_URL="${GAS_EXEC_URL:-}"
if [ -z "$GAS_EXEC_URL" ]; then
  read -r -p "  GASの本番ウェブアプリURL（https://script.google.com/macros/s/…/exec）: " GAS_EXEC_URL
fi
python3 - "$GAS_EXEC_URL" <<'PY' || die "GASのURLの形式が違います（…/exec で終わる本番URLを指定してください）。"
import re, sys
sys.exit(0 if re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_-]{20,200}/exec", sys.argv[1]) else 1)
PY
GAS_API_KEY="${GAS_API_KEY:-}"
if [ -z "$GAS_API_KEY" ]; then
  read -r -s -p "  GASのAPI_KEY（入力は表示されません）: " GAS_API_KEY
  echo
fi
[ -n "$GAS_API_KEY" ] || die "API_KEYが空です。"
printf '%s' "$GAS_EXEC_URL" | npx wrangler secret put GAS_EXEC_URL >/dev/null
printf '%s' "$GAS_API_KEY" | npx wrangler secret put GAS_API_KEY >/dev/null
unset GAS_API_KEY
echo "  ✓ GAS_EXEC_URL / GAS_API_KEY"

cat <<EOF

✅ 配備が終わりました。
   MCPの接続URL（dotに登録するもの）: ${BASE_URL}/mcp

次の手順:
  1. 本番の確認（送信はしない）:      python3 "$SCRIPT_DIR/verify_production.py"
  2. 本人宛てテスト通知を1通送る:     python3 "$SCRIPT_DIR/verify_production.py" --send-test
  3. dot（ChatGPT）への接続:          README.md の「dotへの接続」を参照
     接続コードをクリップボードへ:    security find-generic-password -s $SERVICE -a DOT_CONNECT_CODE -w | pbcopy
EOF
