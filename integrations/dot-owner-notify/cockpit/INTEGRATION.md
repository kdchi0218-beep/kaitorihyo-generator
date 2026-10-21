# KAI COCKPIT への組み込み手順

`.secretary/cockpit/server.py`（http://127.0.0.1:8787/#standby）で、dot の通知をクラウドから取得して表示するための手順です。
このクラウド作業環境からは Mac 上の `server.py` を読めなかったため、**組み込み自体は Mac 上の Claude Code（または Codex）で行ってください**。下の「Claude Code に渡す依頼文」をそのまま貼れば進められます。

## 方針

- コックピットは**読むだけ**。通知の保存とLINE送信はクラウド（Cloudflare Worker）で完結しているので、コックピットが止まっていても通知は止まりません。
- 起動時に1回、クラウドから差分を取得してローカルにキャッシュします（起動中は任意で5分ごとに追いつく）。
- 使うのは読み取り専用トークン（キーチェーン `dot-owner-notify` / `COCKPIT_READ_TOKEN`）だけ。このトークンでは通知を送れません。
- 状態の表示は「LINE送信済み（API受付・本人の受信は未確認）」のように、API成功と本人の受信確認を区別します。

## 組み込む内容

1. `cloud_notifications.py` を `.secretary/cockpit/` にコピーする（標準ライブラリのみ）。
2. キャッシュの置き場所を決める。既定は `cockpit/cache/dot_notifications.json`。Git管理外にする（`.gitignore` に `cache/` を追加）。別の場所にする場合は環境変数 `DOT_NOTIFY_CACHE_PATH`。
3. `server.py` の起動処理で、**画面の表示を待たせないよう別スレッドで**取得する。

   ```python
   import cloud_notifications

   # 起動時に1回追いつき、その後は起動中だけ5分ごとに追いつく（失敗してもコックピットは止めない）
   cloud_notifications.start_background_sync(interval_sec=300)
   ```

4. `server.py` に読み取り用のエンドポイントを1つ足す（既存のルーティング方式に合わせる）。

   - `GET /api/dot-notifications` → `cloud_notifications.load(limit=100)` をJSONで返す
   - `GET /api/dot-notifications?refresh=1` → 先に `cloud_notifications.sync_safely()` を呼んでから返す

5. `#standby` 画面に「dot の通知」パネルを足す。表示例（既存のスタイルに合わせて調整）:

   ```js
   async function renderDotNotifications(container) {
     const res = await fetch('/api/dot-notifications')
     const data = await res.json()
     const icon = { info: '🔔', important: '⚠️', urgent: '🚨' }
     const head = data.last_error
       ? `最終取得 ${data.last_synced_at ?? '未取得'}（取得エラー: ${data.last_error.code}）`
       : `最終取得 ${data.last_synced_at ?? '未取得'}`
     container.innerHTML = `<h3>dot の通知</h3><p class="muted">${head}</p>` +
       data.notifications.map((n) => `
         <details>
           <summary>${icon[n.severity] ?? '🔔'} ${escapeHtml(n.title)}
             <small>${new Date(n.created_at).toLocaleString('ja-JP')}・${escapeHtml(n.status_label)}</small></summary>
           <pre>${escapeHtml(n.body)}</pre>
         </details>`).join('')
   }
   ```

   `escapeHtml` は既存の関数を使うか、同等のものを用意してください（本文は外部から来た文字列なので必ずエスケープ）。

## Claude Code に渡す依頼文（Mac で貼り付け）

```
Mac上の Mycompany-v2 プロジェクト（デスクトップの【codex】Mycompany-v2）の KAI COCKPIT に、dot 通知のクラウド取得を組み込んでください。
- 元ファイル: kaitorihyo-generator リポジトリのブランチ claude/dot-line-notification-integration-3ph3pp の
  integrations/dot-owner-notify/cockpit/cloud_notifications.py と INTEGRATION.md
- .secretary/cockpit/server.py の既存の起動処理・ルーティング・#standby 画面の作りを読んでから、それに合わせて組み込む
- 既存の仕事・スケジュール・メール整理の処理は変更しない
- トークンはキーチェーン（service=dot-owner-notify）から読み、画面・ログ・Git に出さない
- 組み込み後、コックピットを再起動して #standby に通知が表示されること、
  `python3 cloud_notifications.py sync` が ok:true を返すことを確認する
```

## 確認

```bash
python3 cloud_notifications.py sync   # {"ok": true, "fetched": …, "total": …}
python3 cloud_notifications.py list   # 新しい順に表示
python3 -m unittest test_cloud_notifications.py
```
