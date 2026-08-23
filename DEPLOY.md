# とんとん 買取表ジェネレーター — 運用・デプロイ手順

## 構成

- とんとん形式（単一シート）と Vault形式（5ジャンル一括）をこのアプリで扱う。Vault専用の `vault-kaitori-generator.vercel.app` は変更しない。
- 本番: `https://tonton-kaitori-generator.vercel.app`
- ホスティング/BFF: Vercel、データ: とんとん専用Supabase（Tokyo）。VaultとSupabaseプロジェクトを共有しない。
- ブラウザはSupabaseへ直接アクセスしない。ログイン、全データCRUD、画像取得は同一オリジンのVercel BFF（`/api/*`）経由。

## ブラウザ固定（必ず守る運用）

最初にパスワードでログインしたブラウザが、そのアカウントの利用ブラウザとして固定されます。同じブラウザでは再ログインできますが、別ブラウザ・別ブラウザプロフィール・Cookie削除・PC交換後はログインできません。

- 変更が必要なときは、管理画面の対象ユーザーで **「ブラウザ登録を解除」** を実行する。次回のパスワードログインで新しいブラウザへ固定される。
- 管理者自身の解除は、**別の管理者**が行う。管理者を最低2人登録しておく（1人だけにしない）。
- 緊急時に全管理者が入れない場合のみ、Supabase Dashboard → SQL Editorで対象ユーザーの有効な `browser_bindings` を `revoked_at` 付きで解除する。理由と実行者を `browser_binding_events` に残し、復旧直後に別の管理者を追加する。RLSの無効化、鍵の共有、テーブル削除はしない。

```sql
update public.browser_bindings
set revoked_at = now(),
    revoked_by = (select id from auth.users where lower(email) = lower('<作業管理者メール>')),
    revocation_reason = '緊急解除: <理由>'
where user_id = (select id from auth.users where lower(email) = lower('<対象メール>'))
  and revoked_at is null;
```

セッションJWTとブラウザ秘密値は `HttpOnly` Cookieだけに保管され、画面のJavaScript・localStorage・スプレッドシートには置かれません。

## 環境変数

| 種別 | 変数 | 設定先 |
|---|---|---|
| 公開ビルド値 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel Production/Preview/Development |
| サーバー専用 | `SUPABASE_URL` / `SUPABASE_SECRET_KEY` | **Productionのみ** |
| GAS連携 | `SCRAPER_API_KEY` | Production/Preview（十分に長いランダム値） |
| CardRushブラウザ取得 | `CHROMIUM_PACK_URL` | Chromium 149 **x86_64** packのHTTPS URL |

`SUPABASE_SECRET_KEY` は絶対に `VITE_` を付けない。本番Supabaseの秘密鍵をPreviewへ設定しないこと。Previewは本番Supabaseを共有せず、必要なら専用の検証用Supabaseと鍵を使う。

## 初回セットアップ

1. Supabaseのmigrationを次の順に適用する。

   1. `20260822000000_create_tonton_app_schema.sql`
   2. `20260823000000_create_scrape_cache.sql`
   3. `20260823001000_lock_down_scrape_cache.sql`
   4. `20260823002000_harden_tonton_schema.sql`
   5. `20260823105529_add_browser_binding.sql`

2. Supabase Dashboard → Authentication → Users で最初の管理者を作り、SQL Editorで管理者権限を付与する。

```sql
insert into public.app_admins (user_id)
select id from auth.users
where lower(email) = lower('<管理者メールアドレス>')
on conflict (user_id) do nothing;
```

3. 最初の管理者でログインし、すぐに2人目の管理者を用意する。一般ユーザーは管理画面から作成し、**12文字以上の初期パスワード**を設定する。招待メール方式は使わない。

## ローカル開発

```bash
cd ~/Documents/案件系/とんとん総合版ジェネレーター
npm install
npm run dev
```

Viteだけの `npm run dev` では `/api/*` は動きません。ログイン、データ同期、画像、CardRush/GAS連携を確認する場合はVercelのPreviewまたは本番相当環境で確認する。

## デプロイ

```bash
npm run lint
npm test
npm run build
git add <変更したファイル>
git commit -m "変更内容"
git push origin main
```

Vercel反映後、強制再読み込みして、ログイン・ブラウザ固定・店舗データ保存・private画像表示を確認する。旧フロントを開いたまま新BFF/RLS migrationを先に適用すると旧版はデータを読めなくなるため、メンテナンス時間を取り、利用者へ再読み込みを案内してから切り替える。

## 🐽トントン_買取表管理_v2 の切替

GAS: `~/Desktop/【codex】Mycompany-v2/.secretary/gas/kaitori/sheet-manager-v2.gs`

| Property | 値 |
|---|---|
| `CARD_RUSH_PROXY_URL` | `https://<Vercel本番ドメイン>/api/cardrush` |
| `SCRAPER_API_KEY` | Vercel Productionの同名値 |

切替後、ポケモン・ワンピース・BOXを各1件手動確認してから自動トリガーを有効にする。障害時は `CARD_RUSH_PROXY_URL` を削除して旧取得先へ戻せる。鍵をGASコードやセルに書かない。

## 構成ファイル

| 対象 | ファイル |
|---|---|
| 入力タイプ・Excel解析 | `src/lib/inputSources.js` / `src/lib/excelSource.js` / `src/lib/vaultParser.js` / `src/lib/tontonParser.js` |
| 店舗データCRUD（BFF） | `src/lib/apiClient.js` / `src/lib/storeSync.js` / `api/data.js` |
| ログイン・Cookieセッション | `src/lib/authApi.js` / `api/auth/*.js` / `api/_lib/browser-session.js` |
| ブラウザ固定の管理 | `src/lib/browserAdmin.js` / `src/components/AdminPanel.jsx` / `api/admin/browser-users.js` |
| 管理者によるユーザー作成 | `api/admin/create-user.js` |
| private画像の配信 | `api/asset.js`（`store-assets` はprivate） |
| CardRush API | `api/cardrush/*.js` / `api/_lib/cardrush-*.js` |
| Supabase schema/RLS | `supabase/migrations/*.sql` |

旧 `src/lib/supabase.js` は廃止済み。新しい画面側の接続は `src/lib/apiClient.js` と `src/lib/authApi.js` を使う。

最終更新: 2026-08-23
