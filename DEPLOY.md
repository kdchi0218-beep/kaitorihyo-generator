# とんとん 買取表ジェネレーター — 開発・デプロイ手順

## 概要
- 元のとんとん版を統合版として運用し、Vault形式の入力にも対応する
- **とんとん形式**: ポケモン・ワンピースの単一シート（初期選択） / **Vault形式**: 5ジャンル一括
- `🐽トントン_買取表管理_v2` のCardRush取得先も同じVercel Functionsへ集約
- 認証・設定同期は **Supabase**、ホスティングは **Vercel**
- `vault-kaitori-generator.vercel.app` はVault専用版のまま、このアプリとは別管理にする

## インフラ情報
| 項目 | 値 |
|---|---|
| 本番URL（予定） | https://tonton-kaitori-generator.vercel.app |
| GitHub | kdchi0218-beep/kaitorihyo-generator (private) |
| Git管理ローカル | ~/Documents/案件系/とんとん総合版ジェネレーター |
| Supabase | とんとん専用プロジェクト（Tokyo／Vaultと分離） |

## 必須ランタイム・環境変数

- Node.js `22.17.0` 以上
- フロント公開値: `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`
- Vercelサーバー専用: `SUPABASE_URL` / `SUPABASE_SECRET_KEY`
- スクレイピング専用: `SCRAPER_API_KEY`（十分に長いランダム値）
- Chromium: `CHROMIUM_PACK_URL`（Chromium 149のarm64 packを置いたHTTPS URL）

`SUPABASE_SECRET_KEY`、`SCRAPER_API_KEY` は `VITE_` を付けず、クライアントへ公開しないこと。

## ローカル開発
```bash
cd ~/Documents/案件系/とんとん総合版ジェネレーター
npm install        # 初回のみ（node_modules）
npm run dev        # ローカルプレビュー（http://localhost:5173）
                   # ※ /api/* (スプシ取得・招待・画像プロキシ) はローカルでは動かない。本番でのみ動作
```

## デプロイ手順（これだけ）
```bash
cd ~/Documents/案件系/とんとん総合版ジェネレーター
npm run lint
npm test
npm run build                              # ビルド確認（エラーが無いこと）
git add <変更したファイル>                    # 無関係な未追跡ファイルは追加しない
git commit -m "変更内容"
git push origin main                       # → Vercelが自動デプロイ（1〜2分）
```
反映確認: 1〜2分後に本番URLを Cmd+Shift+R（強制再読み込み）。

## ⚠️ 重要な注意点（ハマりどころ）
1. **コミットauthorは `k.dchi0218@gmail.com` 固定**（git config設定済み）。
   GitHubアカウントと一致しないメールでコミットすると **Vercelがデプロイをブロック**する（"commit author email is not your Git account"）。
   → `git config user.email` が `k.dchi0218@gmail.com` であることを確認。
2. **Supabaseの初期化**は `supabase/migrations/` を古いタイムスタンプ順に適用する。
   店舗データはRLSで管理者または所属店舗だけに限定し、`scrape_cache` はservice_role専用。
3. **鍵は `.env.local`（gitignore済み・絶対コミットしない）**。
   スクレイピング用の2変数もVercelのProduction/Previewへ設定する。
4. **招待メール**を使うには Supabase → Authentication → URL Configuration の Site URL / Redirect URLs に本番URLを設定。

## 🐽トントン_買取表管理_v2 の切替

GASソースは `~/Desktop/【codex】Mycompany-v2/.secretary/gas/kaitori/sheet-manager-v2.gs`。本番反映後、Apps ScriptのScript Propertiesへ次を設定する。

| Property | 値 |
|---|---|
| `CARD_RUSH_PROXY_URL` | `https://<Vercel本番ドメイン>/api/cardrush` |
| `SCRAPER_API_KEY` | Vercelの同名環境変数と同じ値 |

未設定時は旧 `app.card-desk.com` へフォールバックする。障害時は `CARD_RUSH_PROXY_URL` を削除すれば旧取得先へ戻せる。鍵はGASソースやスプレッドシートのセルへ記載しない。

切替後は、スプシからポケモン1件・ワンピース1件・BOX検索1件を手動取得し、価格・画像・商品URLを確認してから自動トリガーを有効にする。

## Vercel CLIで直接デプロイ（自動デプロイが詰まった時の保険）
```bash
export VERCEL_TOKEN=<トークン>
npx vercel@latest build --prod --yes --token "$VERCEL_TOKEN"
npx vercel@latest deploy --prebuilt --prod --yes --token "$VERCEL_TOKEN"
```
※ 環境によってはアップロードが詰まることがある。基本は git push 自動デプロイを使う。

## 構成ファイルの場所
| 何を直すか | ファイル |
|---|---|
| 5ジャンル定義・裏面画像 | `src/lib/genres.js` |
| 価格ロジック（掛け率/定額/端数） | `src/lib/pricing.js` |
| 2入力タイプ切替 | `src/lib/inputSources.js` / `src/components/ExcelUploader.jsx` |
| Excel取り込み | `src/lib/excelSource.js` / `src/lib/vaultParser.js` / `src/lib/tontonParser.js` |
| 買取表の見た目（プレビュー） | `src/components/Preview.jsx` |
| カード選択UI | `src/components/CardSelector.jsx` |
| 各種設定パネル | `src/components/settings/*.jsx` |
| 店舗・ユーザー管理画面 | `src/components/AdminPanel.jsx` |
| Supabase連携 | `src/lib/supabase.js` / `src/lib/storeSync.js` |
| CardRush API | `api/cardrush/*.js` / `api/_lib/cardrush-*.js` |
| Supabaseキャッシュ | `api/_lib/scrape-cache.js` / `supabase/migrations/*.sql` |
| その他サーバー関数 | `api/sheet.js` / `api/admin/create-user.js` / `api/image-proxy.js` |
| 裏面画像 | `public/card-back*.jpg` |
