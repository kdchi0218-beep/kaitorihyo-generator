// 定番リスト（店舗内共有・ジャンル別）。Supabase card_lists テーブル。
// カード識別キー/適用ロジックは cardKeys.js（supabase非依存・テスト可能）に分離。

import { supabase } from './supabase.js'

// 互換のため再エクスポート（既存の import 元はパス変更不要）
export { cardKey, itemKey, baseKey, applyList, applyListWithMissing, mergeMissingIntoSelection, applyManualPricesToItems, detectRenamedCards, resolveItems, enrichItems, dedupeItems, cardsToItems, tokyoDateKey } from './cardKeys.js'

// ---- CRUD ----

export async function listCardLists(storeId, genre) {
  const { data, error } = await supabase
    .from('card_lists').select('id, name, items, updated_at')
    .eq('store_id', storeId).eq('genre', genre).order('name', { ascending: true })
  if (error) throw error
  return data || []
}

export async function createCardList(storeId, genre, name) {
  const { data, error } = await supabase
    .from('card_lists').insert({ store_id: storeId, genre, name, items: [] }).select().single()
  if (error) throw error
  return data
}

// 別店舗にリストをコピー送信（中身ごと）
export async function copyCardListToStore(targetStoreId, genre, name, items) {
  const { error } = await supabase
    .from('card_lists').insert({ store_id: targetStoreId, genre, name, items: items || [] })
  if (error) throw error
}

export async function saveCardListItems(id, items) {
  const { data, error } = await supabase
    .from('card_lists').update({ items, updated_at: new Date().toISOString() }).eq('id', id)
    .select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('定番リストが見つからないか、更新権限がありません')
}

export async function deleteCardList(id) {
  const { data, error } = await supabase.from('card_lists').delete().eq('id', id).select('id').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('定番リストが見つからないか、削除権限がありません')
}
