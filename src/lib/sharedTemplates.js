// テンプレート（店舗内のみ共有・ジャンル別）。Supabase templates テーブル。
// 同じ店舗のアカウント間で共有（店舗間では共有しない）。

import { supabase } from './supabase.js'

export async function listTemplates(storeId, genre) {
  let q = supabase.from('templates').select('id, name, settings, updated_at')
    .eq('store_id', storeId)
    .order('updated_at', { ascending: false })
  if (genre) q = q.eq('genre', genre)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function saveTemplate(storeId, genre, name, settings) {
  const { data, error } = await supabase
    .from('templates').insert({ store_id: storeId, genre, name, settings }).select().single()
  if (error) throw error
  return data
}

export async function updateTemplate(id, name, settings) {
  const { data, error } = await supabase
    .from('templates').update({ name, settings, updated_at: new Date().toISOString() }).eq('id', id)
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('テンプレートが見つからないか、更新権限がありません')
}

export async function deleteTemplate(id) {
  const { data, error } = await supabase.from('templates').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('テンプレートが見つからないか、削除権限がありません')
}

// テンプレ名だけ変更（中身は変えない）
export async function renameTemplate(id, name) {
  const { data, error } = await supabase
    .from('templates').update({ name, updated_at: new Date().toISOString() }).eq('id', id)
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('テンプレートが見つからないか、更新権限がありません')
}
