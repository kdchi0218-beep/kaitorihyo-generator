// 定番リスト（店舗内共有・ジャンル別）。Supabase card_lists テーブル。
// カード識別キー/適用ロジックは cardKeys.js（supabase非依存・テスト可能）に分離。

import { postData } from './apiClient.js'

// 互換のため再エクスポート（既存の import 元はパス変更不要）
export { cardKey, itemKey, baseKey, applyList, applyListWithMissing, mergeMissingIntoSelection, applyManualPricesToItems, detectRenamedCards, resolveItems, enrichItems, dedupeItems, cardsToItems, tokyoDateKey } from './cardKeys.js'

// ---- CRUD ----

export async function listCardLists(storeId, genre) {
  return postData('list_card_lists', { storeId, genre })
}

export async function createCardList(storeId, genre, name) {
  return postData('create_card_list', { storeId, genre, name })
}

// 別店舗にリストをコピー送信（中身ごと）
export async function copyCardListToStore(targetStoreId, genre, name, items) {
  await postData('copy_card_list', { storeId: targetStoreId, genre, name, items: items || [] })
}

export async function saveCardListItems(id, items) {
  const data = await postData('save_card_list', { id, items })
  if (!Array.isArray(data) || data.length === 0) throw new Error('定番リストが見つからないか、更新権限がありません')
}

export async function deleteCardList(id) {
  const data = await postData('delete_card_list', { id })
  if (!Array.isArray(data) || data.length === 0) throw new Error('定番リストが見つからないか、削除権限がありません')
}
