// テンプレート（店舗内のみ共有・ジャンル別）。Supabase templates テーブル。
// 同じ店舗のアカウント間で共有（店舗間では共有しない）。

import { postData } from './apiClient.js'

export async function listTemplates(storeId, genre) {
  return postData('list_templates', { storeId, genre })
}

export async function saveTemplate(storeId, genre, name, settings) {
  return postData('create_template', { storeId, genre, name, settings })
}

export async function updateTemplate(id, name, settings) {
  const data = await postData('update_template', { id, name, settings })
  if (!Array.isArray(data) || data.length === 0) throw new Error('テンプレートが見つからないか、更新権限がありません')
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
