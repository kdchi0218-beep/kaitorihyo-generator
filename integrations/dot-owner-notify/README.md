# dot → 本人のAimo公式LINE ＋ KAI COCKPIT 通知中継

dot が行う能動チェック（朝の確認・見落とし・返信待ちなど）の結果を、**オーナー本人だけ**の Aimo 公式LINE へ届け、同じ内容をクラウドに保存して KAI COCKPIT でも見られるようにします。
チェックの主体は dot のまま。この中継は「届ける・保存する」だけで、監視・チェックは一切しません。

```
dot（ChatGPT・クラウド）
   │ MCP（OAuth。接続コードで本人が1回許可）
   ▼
Cloudflare Worker「dot-owner-notify」 ── D1に保存（通知・送信結果・重複防止）
   │ push_brief_v2（本人限定API。宛先はGAS側で固定）
   ▼
既存GAS「AI秘書公式LINE」 ──► LINE Messaging API ──► 本人のLINE

KAI COCKPIT（Mac・起動時だけ） ──読み取り専用トークン──► Worker の /api/notifications
```

Mac・Claude Code・コックピットを閉じていても、dot → Worker → GAS → LINE はすべてクラウドで完結します。Mac は初期設定（配備）と、コックピットでの閲覧にだけ使います。

## 安全のための作り

| 要件 | 実装 |
|---|---|
| 本人以外に送らない | 宛先を受け取る入力が無い（`to` などを渡すと拒否）。送信は GAS の `push_brief_v2` だけで、宛先は GAS の `MORNING_BRIEF_V2_OWNER_LINE_USER_ID`（オーナーがちょうど1名のときだけ有効）。複数オーナーに届きうる旧 `action=push` は呼べない（呼べる action を2つに限定） |
| 認証 | dot は OAuth 2.1（PKCE必須・動的登録・戻り先は chatgpt.com のみ）。許可画面で本人だけが知る**接続コード**を入力。コックピットは別の読み取り専用トークン。トークンはハッシュだけ保存 |
| 重複防止 | `notification_id` が一意キー。同じIDの再呼び出しは再送しない。内容が違えば拒否。GAS側にも `dot:<ID>` で受領記録があり二重に守る |
| 送信結果の記録 | 通知ごとの状態（sent / uncertain / failed / saved_only）と、試行ごとの GAS 応答コードを D1 に保存 |
| 結果不明の扱い | LINE API の結果が不明（uncertain）なら自動で再送しない。送信前に止まった失敗（failed）だけ、同じIDで呼び直すと再試行 |
| 暴走防止 | 1日（JST）のLINE依頼は既定20回まで（`DAILY_LINE_LIMIT`） |
| 失効 | 接続コードを入れ替えると、発行済みの dot 用トークンが全部無効。refresh token の使い回しを検知したら同系統を一括停止 |
| 秘密情報 | 値は Mac のキーチェーンと Cloudflare の secret にだけ置く。リポジトリ・ログ・画面に出さない |

「API成功」と「本人の受信」は別物として扱います。`delivery: sent` は「GAS経由で LINE API が受け付けた」という意味で、本人の受信確認ではありません。

## ファイル

```
worker/                 Cloudflare Worker（MCP・OAuth・保存・GAS中継）
  src/                  index.js（入口）/ mcp.js / oauth.js / notify.js / gas.js / util.js
  migrations/           D1のテーブル定義
  test/                 ローカルE2E（wrangler dev ＋ 模擬GAS。本番には一切つながない）
cockpit/                KAI COCKPIT 用の取得モジュールと組み込み手順
scripts/setup-mac.sh    Macから1回だけ実行する配備スクリプト
scripts/verify_production.py  本番の確認（送信なし／テスト通知1通／GASの本人限定の有効化）
gas/RETIRE_PROACTIVE_CHECKS.md  GASに残る旧能動チェックの停止手順
```

## 1. 初期設定（Macで1回だけ）

必要なもの: Node.js、Python 3、Cloudflare アカウント（既存の Worker と同じアカウント）、GAS の本番 URL と `API_KEY`。

```bash
cd integrations/dot-owner-notify/scripts
# GASの値は Mycompany-v2 の send_line_push.py が使っている設定から渡す（画面に出さない）
GAS_EXEC_URL='https://script.google.com/macros/s/…/exec' GAS_API_KEY='…' ./setup-mac.sh
```

`setup-mac.sh` がすること: D1作成とテーブル作成 → Worker配備 → 接続コード・コックピット用トークン・検証用トークンを生成してキーチェーン（サービス名 `dot-owner-notify`）に保存 → それらと GAS の値を `wrangler secret put` で登録。
新しく作る資格情報はこの3つだけで、どれもこの中継の中でしか使えません（下の「権限」を参照）。

## 2. 本番の確認

```bash
python3 verify_production.py                 # 送信しない確認（認証・MCP・GASの本人限定設定・コックピット取得）
python3 verify_production.py --configure-gas # 「本人1名だけに送れる状態」が✖のとき。宛先がちょうど1名の場合だけ有効化（確認あり）
python3 verify_production.py --send-test     # 本人宛てに「【テスト】dot通知の接続確認」を1通送り、重複防止と読み戻しも確認
```

`--send-test` の最後に「LINEに届いたか」を聞きます。ここで本人が LINE を見て答えるまでは「本人の受信は未確認」です。

### 宛先が1名でない場合

`get_notify_status` の `ownerCount` が 2 以上だと、GAS の本人限定API は安全側に倒れて送信を拒否します（設計どおり）。既存のオーナー設定（`OWNER_LINE_USER_IDS`）を変えると他の機能の送り先も変わるため、この場合はそこで止めて、GAS 側に「本人限定配信専用の宛先プロパティ」を足すかどうかを決めてから進めてください。

## 3. dot への接続（ChatGPT 開発者モードのコネクタ）

1. ChatGPT の設定 →「アプリとコネクタ」→ 詳細設定で**開発者モード**をオンにする。
2. 「コネクタを作成」で次を入力する。
   - 名前: `Aimo本人通知`
   - MCPサーバーURL: **`https://dot-owner-notify.<アカウントのサブドメイン>.workers.dev/mcp`**（`setup-mac.sh` の最後に表示。キーチェーンの `BASE_URL` に `/mcp` を付けたもの）
   - 認証: **OAuth**（クライアントIDなどは空欄のまま。動的登録で自動設定されます）
3. 「接続」を押すと、この Worker の許可画面が開く。Mac で接続コードをコピーして貼り、「許可する」。
   ```bash
   security find-generic-password -s dot-owner-notify -a DOT_CONNECT_CODE -w | pbcopy
   ```
4. dot の指示（プロジェクトの指示や定期タスクの文面）に、下の「dot に追加する指示」を足す。
5. dot に「get_notify_status を実行して」と頼み、`本人限定の通知経路は使える状態です` と返ることを確認。
6. **Mac を閉じた状態で**、スマホの ChatGPT から dot に「notify_owner で接続テスト通知を送って（notification_id は test:dot:今日の日付）」と頼み、LINE に届くか本人が確認する。後で Mac のコックピットを起動したとき、その通知が表示されることも確認する。

### 利用可能な操作（MCPツール）

| 操作 | 内容 | 書き込み |
|---|---|---|
| `notify_owner` | 本人の LINE へ通知し、クラウドに保存。入力: `notification_id`, `title`(≤80字), `body`(≤3500字), `category`(morning_check / missed_item / awaiting_reply / other), `severity`(info / important / urgent), `deliver_line`(false で保存のみ) | あり（本人宛てのみ） |
| `get_notify_status` | 中継の設定状況、GAS の本人限定設定（宛先数・準備完了・トークン有無）、直近の件数。宛先IDやトークンの値は返さない | なし |
| `list_notifications` | 保存済み通知の一覧（`limit`, `since`, `status`） | なし |
| `get_notification` | 1件の内容と送信試行の記録 | なし |

### dot に追加する指示（貼り付け用）

```
## 本人への通知（LINE）
- 朝の確認・見落とし・返信待ちなどで本人に知らせるべき結果が出たら、ChatGPTの通知ではなく「Aimo本人通知」コネクタの notify_owner を使う。
- notification_id は「種類:日付(JST):対象」で決める（例: morning_check:2026-10-21、awaiting_reply:2026-10-21:<スレッドID>）。同じ事項を同じ日に二度送らない。
- category は 朝の確認=morning_check／見落とし=missed_item／返信待ち=awaiting_reply／その他=other。要対応は severity=important、急ぎは urgent。
- 知らせることが無ければ送らない（記録だけ残したいときは deliver_line=false）。
- delivery が uncertain なら再送しない（本人にLINEで確認してもらう）。failed なら status_detail を見て、同じIDで1回だけ再試行。
- 本文にパスワード・トークン・他人の個人情報の全文を書かない。
```

### dot 側で確認が必要な点（未確認）

- ChatGPT の契約プランによっては、開発者モードのコネクタが「読み取り専用」に制限されたり、書き込みの操作（`notify_owner`）の実行前に確認ボタンが出たりします。**定期タスク（人がいない実行）で `notify_owner` が確認待ちで止まらないか**を、手順 6 で必ず確かめてください。
- 定期タスクからカスタムコネクタを呼べるかも ChatGPT 側の仕様次第です。呼べない場合は、dot の実行形態（どこから定期実行しているか）に合わせて接続方法を見直します。

## 4. KAI COCKPIT

`cockpit/INTEGRATION.md` を参照。起動時にクラウドから差分を取得して #standby に表示します（Mac 上の Claude Code で組み込み）。

## 5. GAS の旧能動チェックを止める

`gas/RETIRE_PROACTIVE_CHECKS.md` を参照（8:55 の朝サマリー、9:30／14:00 の能動チェッカー）。

## 権限（新しく作る資格情報）

| 名前 | 置き場所 | できること | 失効のしかた |
|---|---|---|---|
| `DOT_CONNECT_CODE` | キーチェーン・Worker secret | ChatGPT の許可画面で dot の接続を許可する | 新しい値を `wrangler secret put` → 既存の dot 用トークンが全部無効 |
| dot 用アクセストークン | ChatGPT 内（Workerにはハッシュのみ） | 上の4操作だけ（1時間で期限切れ、refresh は90日・使うたびに入れ替え） | 接続コードの入れ替え／ChatGPT でコネクタ削除 |
| `COCKPIT_READ_TOKEN` | キーチェーン・Worker secret | 通知の読み取りだけ（送信不可） | 新しい値を `wrangler secret put` |
| `MCP_STATIC_TOKEN` | キーチェーン・Worker secret | Mac での検証用（4操作） | 確認が済んだら `npx wrangler secret delete MCP_STATIC_TOKEN` で削除してよい |
| `GAS_API_KEY`, `GAS_EXEC_URL` | Worker secret のみ | 既存の値をそのまま使う。Worker は `push_brief_v2` と `push_brief_v2_status` 以外を呼ばない | GAS の API_KEY を入れ替えたら secret も更新 |

## 戻し方

- dot からの通知を止める: ChatGPT のコネクタを削除、または `DOT_CONNECT_CODE` を入れ替える。
- 中継ごと止める: `cd worker && npx wrangler delete`（D1 は `npx wrangler d1 delete dot-owner-notify` で別途削除。保存した通知も消えるので、必要なら先に `/api/notifications` で取得）。
- GAS: この中継のために GAS のコードは変更していません。`--configure-gas` で有効化した場合は、スクリプトプロパティ `MORNING_BRIEF_V2_ENABLED` を削除すれば本人限定APIは止まります（他の機能には影響しません）。旧能動チェックの停止を戻す方法は `gas/RETIRE_PROACTIVE_CHECKS.md` の最後を参照。
- キーチェーン: `security delete-generic-password -s dot-owner-notify -a <名前>`。

## 開発者向け

```bash
cd worker && npm install && npm test                 # ローカルE2E（21件）
cd ../cockpit && python3 -m unittest test_cloud_notifications.py
```

費用の目安: Cloudflare Workers・D1・Cron は無料枠内で収まる規模です。LINE の送信は公式アカウントの月間メッセージ数を消費します（1通知＝1通）。
