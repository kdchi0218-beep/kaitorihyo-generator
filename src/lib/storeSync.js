// 店舗データのクラウド同期レイヤー。
// 認証済みの同一オリジンBFFだけを利用し、Supabase資格情報をブラウザへ出さない。
import { postData, uploadSignedAsset } from './apiClient.js'
import { isValidAccountPasswordLength } from './accountPassword.js'
import { persistSettingsAssets } from './settingsAssets.js'

const MAX_ASSET_BYTES = 10 * 1024 * 1024
const ALLOWED_ASSET_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

/** 現在のユーザーが管理者か */
export async function checkIsAdmin() {
  return (await postData('check_admin')).isAdmin === true
}

/** 自分が使える店舗一覧（管理者=全店 / 店舗ユーザー=所属店のみ） */
export async function listMyStores() {
  return postData('list_my_stores')
}

/** 送信先の店舗一覧（管理者は全店、店舗ユーザーはRLSで所属店のみ） */
export async function listAllStores() {
  return postData('list_all_stores')
}

// ---- 店舗設定（背景画像URL・色・価格ルール等） ----

export async function loadStoreSettings(storeId) {
  return postData('load_settings', { storeId })
}

export async function saveStoreSettings(storeId, settings) {
  const persistedSettings = await persistSettingsAssets(storeId, settings, { upload: uploadAsset })
  const data = await postData('save_settings', { storeId, settings: persistedSettings })
  if (!Array.isArray(data) || data.length === 0) throw new Error('店舗設定を保存できませんでした')
  return persistedSettings
}

// テンプレートのCRUDは sharedTemplates.js（templatesテーブル・ジャンル別）に一本化済み。
// 旧 store_templates テーブル系の関数はデッドコードだったため削除（2026-06 監査）。

// ---- 画像（背景・ロゴ）→ private Storage に上げてBFF URLを返す ----

export async function uploadAsset(storeId, file) {
  if (!ALLOWED_ASSET_TYPES.has(file.type)) {
    throw new Error('PNG / JPEG / WebP / GIF / AVIF 画像を選んでください')
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ASSET_BYTES) {
    throw new Error('画像は10MB以下のファイルを選んでください')
  }
  const upload = await postData('create_asset_upload', {
    storeId, filename: file.name, contentType: file.type, size: file.size,
  })
  return uploadSignedAsset(upload, file)
}

// ---- 管理者操作（RLSで管理者のみ通る） ----

/** 店舗を新規作成（管理者のみ） */
export async function createStore(name) {
  return postData('create_store', { name })
}

/** 既存ユーザーを店舗メンバーに追加（管理者のみ） */
export async function addMember(storeId, userId) {
  await postData('add_member', { storeId, userId })
}

/** 店舗を削除（管理者のみ・設定/メンバーもcascade削除） */
export async function deleteStore(storeId) {
  const data = await postData('delete_store', { storeId })
  if (!Array.isArray(data) || data.length === 0) throw new Error('店舗が見つからないか、削除権限がありません')
}

/**
 * 新規ユーザーを作成して店舗に追加（管理者のみ）。
 * service_role が必要なため Vercel Function 経由。管理者確認はHttpOnly Cookieで行う。
 */
export async function createUserInStore({ email, password, storeId }) {
  if (!isValidAccountPasswordLength(password)) {
    throw new Error('パスワードは8文字以上かつUTF-8で72バイト以下にしてください')
  }
  const res = await fetch('/api/admin/create-user', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, storeId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `ユーザー作成失敗 (${res.status})`)
  return json
}
