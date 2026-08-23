// 並べ替えの共通ロジック（選択中リスト・リスト編集・プレビューDnDで共用）

/**
 * 1件移動（従来のmoveCardと同じ意味論: 取り出してから toIndex に挿入）
 */
export function moveOne(arr, fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= arr.length || fromIndex < 0 || fromIndex >= arr.length) return arr
  if (fromIndex === toIndex) return arr
  const next = [...arr]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * 複数件をブロックとして移動する（相対順序を保ったまま、ドロップ先へまとめて挿入）。
 * 意味論は moveOne と揃える: 下方向へのドロップはターゲットの後ろ、上方向はターゲットの前。
 * @param {any[]} arr
 * @param {Set<number>} movingIdxSet 動かす要素のインデックス集合
 * @param {number} targetIdx ドロップ先（現在の配列上のインデックス）
 */
export function moveBlockByIndex(arr, movingIdxSet, targetIdx) {
  if (!movingIdxSet || movingIdxSet.size === 0) return arr
  if (targetIdx < 0 || targetIdx >= arr.length) return arr
  if (movingIdxSet.has(targetIdx)) return arr            // 自分（の一部）へのドロップは何もしない
  const movingIdxs = [...movingIdxSet].sort((a, b) => a - b)
  const movingItems = movingIdxs.map(i => arr[i])
  const targetItem = arr[targetIdx]
  const rest = arr.filter((_, i) => !movingIdxSet.has(i))
  let insertAt = rest.indexOf(targetItem)
  if (movingIdxs[0] < targetIdx) insertAt += 1           // 下方向ドラッグはターゲットの後ろへ
  const next = [...rest]
  next.splice(insertAt, 0, ...movingItems)
  return next
}

/**
 * id基準のブロック移動（カード配列用）。
 * @param {{id:any}[]} arr
 * @param {any[]} movingIds 動かすカードのid（チェック順不問・配列内の出現順で並ぶ）
 * @param {any} targetId ドロップ先カードのid
 */
export function moveBlockById(arr, movingIds, targetId) {
  const idSet = new Set(movingIds)
  const movingIdxSet = new Set(arr.map((c, i) => (idSet.has(c.id) ? i : -1)).filter(i => i >= 0))
  const targetIdx = arr.findIndex(c => c.id === targetId)
  if (targetIdx < 0) return arr
  return moveBlockByIndex(arr, movingIdxSet, targetIdx)
}
