// 店舗データのクラウド同期レイヤー（Supabase）
// RLSにより: 管理者=全店、店舗ユーザー=自店のみ アクセス可。

import { supabase } from './supabase.js'

const MAX_ASSET_BYTES = 10 * 1024 * 1024
const ALLOWED_ASSET_TYPES = new Set(['image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp'])

/** 現在のユーザーが管理者か */
export async function checkIsAdmin() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data } = await supabase
    .from('app_admins').select('user_id').eq('user_id', user.id).maybeSingle()
  return !!data
}

/** 自分が使える店舗一覧（管理者=全店 / 店舗ユーザー=所属店のみ） */
export async function listMyStores() {
  const admin = await checkIsAdmin()
  if (admin) {
    const { data, error } = await supabase
      .from('stores').select('id, name').order('name', { ascending: true })
    if (error) throw error
    return data || []
  }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('store_members').select('store:stores(id, name)').eq('user_id', user.id)
  if (error) throw error
  return (data || []).map(m => m.store).filter(Boolean)
}

/** 全店舗一覧（送信先選択用。stores の select は全認証ユーザーに開放） */
export async function listAllStores() {
  const { data, error } = await supabase
    .from('stores').select('id, name').order('name', { ascending: true })
  if (error) throw error
  return data || []
}

// ---- 店舗設定（背景画像URL・色・価格ルール等） ----

export async function loadStoreSettings(storeId) {
  // 万一行が重複しても読込が全滅しないよう、最新1件を取る
  const { data, error } = await supabase
    .from('store_settings').select('settings, updated_at').eq('store_id', storeId)
    .order('updated_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data?.settings || null
}

export async function saveStoreSettings(storeId, settings) {
  const { data, error } = await supabase
    .from('store_settings')
    .upsert({ store_id: storeId, settings, updated_at: new Date().toISOString() })
    .select('store_id').single()
  if (error) throw error
  if (!data) throw new Error('店舗設定を保存できませんでした')
}

// テンプレートのCRUDは sharedTemplates.js（templatesテーブル・ジャンル別）に一本化済み。
// 旧 store_templates テーブル系の関数はデッドコードだったため削除（2026-06 監査）。

// ---- 画像（背景・ロゴ）→ Storage に上げて公開URLを返す ----

export async function uploadAsset(storeId, file) {
  if (!ALLOWED_ASSET_TYPES.has(file.type)) {
    throw new Error('PNG / JPEG / WebP / GIF / AVIF 画像を選んでください')
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ASSET_BYTES) {
    throw new Error('画像は10MB以下のファイルを選んでください')
  }
  const ext = (file.name.split('.').pop() || 'png').toLowerCase()
  const path = `${storeId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage
    .from('store-assets').upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  const { data } = supabase.storage.from('store-assets').getPublicUrl(path)
  return data.publicUrl
}

// ---- 管理者操作（RLSで管理者のみ通る） ----

/** 店舗を新規作成（管理者のみ） */
export async function createStore(name) {
  const { data, error } = await supabase
    .from('stores').insert({ name }).select().single()
  if (error) throw error
  return data
}

/** 既存ユーザーを店舗メンバーに追加（管理者のみ） */
export async function addMember(storeId, userId) {
  const { error } = await supabase
    .from('store_members').upsert({ store_id: storeId, user_id: userId })
  if (error) throw error
}

/** 店舗を削除（管理者のみ・設定/メンバーもcascade削除） */
export async function deleteStore(storeId) {
  const { error } = await supabase.from('stores').delete().eq('id', storeId)
  if (error) throw error
}

/**
 * 新規ユーザーを作成して店舗に追加（管理者のみ）。
 * service_role が必要なため Vercel Function 経由。管理者のJWTを添えて呼ぶ。
 */
export async function createUserInStore({ email, password, storeId }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch('/api/admin/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, password, storeId }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `ユーザー作成失敗 (${res.status})`)
  return json
}

/** 招待メールを送って店舗に追加（ユーザーが後でパスワード設定）。管理者のみ */
export async function inviteUserToStore({ email, storeId }) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const res = await fetch('/api/admin/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, storeId, invite: true }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `招待失敗 (${res.status})`)
  return json
}
