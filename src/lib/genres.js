// 統合買取表ジェネレーター: パワン形式の共通6ジャンル定義
// 元データ（Googleスプシ各タブ）の列構成差異をここで吸収する。
// 列はヘッダー名で検出するため、旧形式(6/8列・名称一体型)と
// 新形式(9列・商品ID付き・弾/レア分離型)を同じ関数で自動判別して扱える。
//
// hasExpansion/hasRarity:
//   新形式は全ジャンルに「エキスパンション」「レアリティ」列を持つため全ジャンルで true。
//   旧形式(遊戯王のみ弾/レアあり)でも、該当列が無ければ空文字になるだけで害はない。

export const GENRES = [
  {
    key: 'pokemon',
    label: 'ポケモン',
    gameType: 'pokemon',
    placeholder: './card-back.jpg',
    sheetHint: 'ポケモン',
    hasExpansion: true,
    hasRarity: true,
  },
  {
    key: 'pokemon_old',
    label: 'ポケモン旧裏',
    gameType: 'pokemon',
    placeholder: './card-back-pokemon-old.jpg',
    sheetHint: 'ポケモン_旧裏カードe',
    // 新形式のシート名「ポケモン(旧裏・カードe)」も拾えるよう別名を持たせる
    sheetHintsExtra: ['旧裏・カードe', '旧裏', 'カードe'],
    hasExpansion: true,
    hasRarity: true,
  },
  {
    key: 'onepiece',
    label: 'ワンピース',
    gameType: 'onepiece',
    placeholder: './card-back-onepiece.jpg',
    sheetHint: 'ワンピース',
    hasExpansion: true,
    hasRarity: true,
  },
  {
    key: 'yugioh',
    label: '遊戯王',
    gameType: 'yugioh',
    placeholder: './card-back-yugioh.jpg',
    sheetHint: '遊戯王',
    hasExpansion: true,
    hasRarity: true,
  },
  {
    key: 'weiss',
    label: 'ヴァイス',
    gameType: 'weiss',
    placeholder: './card-back-weiss.jpg',
    sheetHint: 'ヴァイス',
    hasExpansion: true,
    hasRarity: true,
  },
  {
    key: 'dragonball',
    label: 'ドラゴンボール',
    gameType: 'dragonball',
    placeholder: './card-back-dragonball.jpg',
    sheetHint: 'ドラゴンボール',
    hasExpansion: true,
    hasRarity: true,
  },
]

export const GENRE_BY_KEY = Object.fromEntries(GENRES.map(g => [g.key, g]))

/** 発注なしカードの手動価格を翌日「前回価格」に戻す対象。現在は全ジャンル共通。 */
export const usesDailyPreviousPrice = (genre) => Boolean(GENRE_BY_KEY[genre])

// 元データのヘッダー名 → 内部フィールドの対応表（新旧フォーマット両対応・表記揺れも許容）
export const HEADER_ALIASES = {
  productId: ['商品ID', '商品id', 'product_id'],           // 新形式の固有ID（安定キー）
  name: ['ガチャ選択肢名称', 'カード名', '商品名', '名称'],   // 新形式は「名称」
  type: ['種別'],
  expansion: ['expansion', '弾', 'エキスパンション'],
  listNo: ['list_no', 'カード番号', 'リストNo', 'listNo', 'リスト番号'], // 新形式は「リスト番号」
  rarity: ['rarity', 'レアリティ'],
  imageUrl: ['画像', 'カード画像URL', '画像URL', 'image'],
  reqCount: ['仕入れ依頼数', '依頼数', '募集数'],            // 新形式は「募集数」
  basePrice: ['納品希望価格', '希望価格', '発注金額', '納品希望価格（税込）', '納品希望価格(税込)'], // 新形式は税込表記
}

// ヘッダー行から投入形式を判定（UI表示・ログ用。パーサ自体は列名で自動対応するため分岐は不要）
export function detectFormat(headerRow) {
  const h = (headerRow || []).map(c => String(c || '').trim())
  if (h.includes('商品ID') && h.includes('名称')) return 'new'
  if (h.includes('ガチャ選択肢名称')) return 'old'
  return 'unknown'
}
