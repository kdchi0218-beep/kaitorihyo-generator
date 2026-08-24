// テンプレート（店舗内のみ共有・ジャンル別）。Supabase templates テーブル。
// 同じ店舗のアカウント間で共有（店舗間では共有しない）。

import { postData } from './apiClient.js'
import { uploadAsset } from './storeSync.js'
import { persistSettingsAssets } from './settingsAssets.js'

export async function listTemplates(storeId, genre) {
  return postData('list_templates', { storeId, genre })
}

export async function saveTemplate(storeId, genre, name, settings) {
  const persistedSettings = await persistSettingsAssets(storeId, settings, { upload: uploadAsset })
  await postData('create_template', { storeId, genre, name, settings: persistedSettings })
  return persistedSettings
}

export async function updateTemplate(id, name, settings, storeId) {
  const persistedSettings = await persistSettingsAssets(storeId, settings, { upload: uploadAsset })
  const data = await postData('update_template', { id, name, settings: persistedSettings })
  if (!Array.isArray(data) || data.length === 0) throw new Error('テンプレートが見つからないか、更新権限がありません')
  return persistedSettings
}

export async function deleteTemplate(id) {
  const data = await postData('delete_template', { id })
  if (!Array.isArray(data) || data.length === 0) throw new Error('テンプレートが見つからないか、削除権限がありません')
}

// テンプレ名だけ変更（中身は変えない）
export async function renameTemplate(id, name) {
  const data = await postData('rename_template', { id, name })
  if (!Array.isArray(data) || data.length === 0) throw new Error('テンプレートが見つからないか、更新権限がありません')
}
