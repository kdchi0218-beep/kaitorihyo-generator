// Vaultパーサー: CSV 2次元配列 + ジャンル → カードオブジェクト配列
// 列はヘッダー名で検出するので、6列(ポケモン系/ワンピ/ヴァイス)も8列(遊戯王)も同じ関数で扱える。

import { HEADER_ALIASES, GENRE_BY_KEY } from './genres.js'

function buildColumnMap(header) {
  const norm = header.map(h => String(h || '').trim())
  const map = {}
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    map[field] = norm.findIndex(h => aliases.includes(h))
  }
  return map
}

function cell(row, idx) {
  if (idx < 0 || idx == null) return ''
  const v = row[idx]
  return v == null ? '' : String(v).trim()
}

function toNumber(v) {
  if (v == null) return 0
  const str = String(v).replace(/[¥￥,、\s]/g, '').trim()
  const n = Number(str)
  return isNaN(n) ? 0 : n
}

/**
 * @param {string[][]} rows CSVの行配列（先頭行=ヘッダー）
 * @param {string} genreKey GENRES の key
 * @returns {{cards: object[], total: number, withPrice: number, withImage: number}}
 */
export function parseVaultRows(rows, genreKey) {
  const genre = GENRE_BY_KEY[genreKey]
  if (!genre) throw new Error(`未知のジャンル: ${genreKey}`)
  if (!rows || rows.length === 0) {
    return { cards: [], total: 0, withPrice: 0, withImage: 0 }
  }

  const col = buildColumnMap(rows[0])
  if (col.name < 0) {
    throw new Error('ヘッダーに「ガチャ選択肢名称(カード名)」列が見つかりません')
  }

  const cards = []
  const seenIds = new Set()
  let withPrice = 0
  let withImage = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const name = cell(row, col.name)
    if (!name) continue

    const listNo = cell(row, col.listNo)
    const type = cell(row, col.type)
    const expansion = genre.hasExpansion ? cell(row, col.expansion) : ''
    const rarity = genre.hasRarity ? cell(row, col.rarity) : ''
    const imgRaw = cell(row, col.imageUrl)
    const imageUrl = imgRaw.startsWith('http') ? imgRaw : null
    const reqCount = toNumber(cell(row, col.reqCount))
    const basePrice = toNumber(cell(row, col.basePrice))
    const productId = cell(row, col.productId)   // 新形式の固有ID（旧形式は空）

    if (basePrice > 0) withPrice++
    if (imageUrl) withImage++

    // 絞り込み用タグ: 弾/レアリティ/種別を結合
    const tagParts = [expansion, rarity, type].filter(Boolean)

    // id: 新形式は商品ID(UUID)を採用（行順が変わっても安定）。旧形式は ジャンル_型番_行番号。
    // どちらも重複したら連番で絶対一意化（Reactキー/選択の破綻防止）。
    let id = productId || `${genreKey}_${listNo || 'card'}_${i}`
    if (seenIds.has(id)) { let n = 2; while (seenIds.has(`${id}__${n}`)) n++; id = `${id}__${n}` }
    seenIds.add(id)

    cards.push({
      id,
      productId,            // 新形式の固有ID（照合の最優先キー・旧形式は空文字）
      genre: genreKey,
      gameType: genre.gameType,
      name,
      listNo,
      type,                 // PSA10 / PSA9 / BOX 等
      expansion,            // 弾（全ジャンル）
      rarity,               // レアリティ（全ジャンル）
      imageUrl,
      reqCount,             // 仕入れ依頼数/募集数（人気の目安・並替に使える）
      basePrice,            // 納品希望価格（発注金額）= 表示価格の元
      tag: tagParts.join(' ') || type,
      selected: false,
    })
  }

  return { cards, total: cards.length, withPrice, withImage }
}
