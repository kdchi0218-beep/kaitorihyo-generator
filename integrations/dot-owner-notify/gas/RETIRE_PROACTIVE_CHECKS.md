# GAS「AI秘書公式LINE」の旧能動チェックを止める手順

能動チェックの主体は dot に一本化するため、GAS に残っている「自分で調べてLINEへ送る」定期処理を止めます。
このクラウド作業環境からは GAS の編集・配備ができないため、**Mac 上の Claude Code（clasp）または GAS エディタで行ってください**。

2026-10-21 時点の本番ソース（Drive からエクスポートして確認）に残っていた能動チェック:

| 定期処理（トリガーのハンドラ） | 時刻 | 中身 | 送り先 | この手順で |
|---|---|---|---|---|
| `automationMorningPushSummary` → `morningPushSummary` | 毎朝 8:55 | 予定・メール・タスクの朝サマリー | 旧 `sendLineNotification`（**オーナー全員**） | 止める |
| `automationProactiveChecker` → `proactiveChecker` | 毎日 9:30 / 14:00 | 期限・定期リマインド・Mac側候補 | 旧経路（オーナー全員） | 止める |
| `morningChecker` / `morningCheckerRemind` | 8:00 / 12:00 | 朝チェック | — | 2026-10-21 に引退済み（変更なし） |
| `automationSupabaseAlertCheck` | 毎時 | Supabase の重要メールの警告 | 旧経路 | **変更しない**（システム警告のため。止めるなら別途指示を） |

止めないもの: LINE の会話応答、給与・経費・Vlabo 連携、スプレッドシート出力、HP/SES 営業メールなど、能動チェック以外の処理はすべてそのまま。
`push_brief_v2_cutover_configure`（GAS 自身が朝ブリーフを送る切替）は **実行しないでください**。朝の確認は dot が行います。

## 変更内容（既存の「引退」の仕組みに乗せる）

作業前に `clasp pull` などで本番の最新ソースを取り込んでから編集してください（2026-10-21 に別の作業で更新されています）。

### 1. トリガーの入口を「呼ばれたら自分のトリガーを消すだけ」にする

`line-bot-webhook.gs` の 2 関数を置き換えます（中身の `morningPushSummary` / `proactiveChecker` は手動実行用に残す）。

```js
// 2026-10-21 引退：能動チェックは dot に一本化（オーナー指示「元々ガスにあった能動チェックはもういらない」）。
// トリガーが次に動いたとき、自分のトリガーを消すだけで、LINEには何も送らない。
function automationMorningPushSummary() { return retireVlaboTriggerHandler_('automationMorningPushSummary'); }

function automationProactiveChecker() { return retireVlaboTriggerHandler_('automationProactiveChecker'); }
```

### 2. 一括片付けの対象に加える

```js
var RETIRED_VLABO_TRIGGER_HANDLERS_ = [
  // …既存の行はそのまま…
  // 能動チェックは dot へ（2026-10-21）。旧名のトリガーが残っていても消す
  'automationMorningPushSummary', 'morningPushSummary',
  'automationProactiveChecker', 'proactiveChecker'
];

var RETIRED_VLABO_AUTOMATION_JOB_IDS_ = [
  // …既存の行はそのまま…
  // 能動チェックは dot へ（2026-10-21）。監視に「未着信」と出ないよう外す
  'gas.line_morning', 'gas.proactive_checker'
];
```

### 3. 再セットアップで復活しないようにする

`setupLineBotAutomationReporting()` から次を削除します。

- `setupMorningTrigger();` の呼び出し
- `ScriptApp.newTrigger('automationProactiveChecker')…` の 2 行（直前の `managed` を消すループは残してよい）
- `definitions` 配列の `gas.line_morning` と `gas.proactive_checker` の 2 行

### 4. 配備と片付け

1. 既存のウェブアプリのデプロイを**新しいバージョンで更新**する（URL が変わらない方法で。新規デプロイにしない）。
2. GAS エディタで `removeRetiredVlaboTriggers` を 1 回実行する（何度実行しても同じ結果）。
3. 確認: `scripts/verify_production.py` の結果、または `push_brief_v2_runtime_inventory` で
   `recognizedMorningTriggerCount` が 0 になっていること。トリガー一覧に上の 4 ハンドラが無いこと。

## 戻し方

1. 上の 1〜3 の変更を元に戻して、デプロイを前のバージョンに戻す（または新バージョンで更新）。
2. GAS エディタで `setupLineBotAutomationReporting` を 1 回実行すると、朝サマリーと能動チェッカーのトリガーが作り直されます。
