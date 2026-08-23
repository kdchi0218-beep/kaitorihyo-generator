// Vault買取表ジェネレーター 全パイプライン回帰テスト（Node組込ランナー: node --test）
// データ取込(Excel) → 価格計算 → カード選択 → 定番リスト(中心) → 設定 を通しで検証する。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'

import { GENRES, GENRE_BY_KEY, HEADER_ALIASES, detectFormat, usesDailyPreviousPrice } from '../src/lib/genres.js'
import { computeDisplayPrice, DEFAULT_PRICING } from '../src/lib/pricing.js'
import { parseVaultRows } from '../src/lib/vaultParser.js'
import { parseExcelAllGenres, parseExcelSingleGenre } from '../src/lib/excelSource.js'
import { cardKey, itemKey, applyList, applyListWithMissing, mergeMissingIntoSelection, applyManualPricesToItems, detectRenamedCards, resolveItems, enrichItems, dedupeItems, cardsToItems, tokyoDateKey } from '../src/lib/cardKeys.js'
import { cardsToCsv } from '../src/lib/cardCsv.js'
import { DEFAULT_SETTINGS } from '../src/lib/defaults.js'

// ---- ヘルパ ----
// XLSX.write(type:'array') は ArrayBuffer を返す → File.arrayBuffer() 互換のダミーfileを作る
const writeFile = (wb) => {
  const ab = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return { arrayBuffer: async () => ab }
}

function buildWorkbook() {
  const wb = XLSX.utils.book_new()
  const head6 = ['ガチャ選択肢名称', '種別', 'list_no', '画像', '仕入れ依頼数', '納品希望価格']
  const sheets = {
    'ポケモン': [head6,
      ['リザードンex SAR', 'PSA10', '001/100', 'https://img/1.jpg', '5', '185498'],
      ['ピカチュウ', 'PSA10', '002/100', '', '3', '12000'],
      ['', 'PSA10', '003/100', '', '1', '9999'],            // 空名→スキップ
      ['ミュウ', '素体', '', 'https://img/4.jpg', '2', '3000'], // 型番なし
    ],
    'ポケモン_旧裏カードe': [head6,
      ['リザードン(旧裏)', 'PSA9', 'OLD-1', '', '1', '50000'],
    ],
    'ワンピース': [head6,
      ['ルフィ', 'PSA10', 'OP01-001', '', '4', '20000'],
      ['ゾロ', 'PSA10', 'OP01-002', '', '2', '8000'],
    ],
    '遊戯王': [['ガチャ選択肢名称', '種別', 'list_no', '弾', 'レアリティ', '画像', '仕入れ依頼数', '納品希望価格'],
      ['青眼の白龍', 'PSA10', 'YG-001', 'LB-01', '20thシークレット', '', '3', '30000'],
    ],
    'ヴァイス': [head6,
      ['初音ミク', 'SP', 'WS-001', '', '1', '5000'],
    ],
  }
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return wb
}

// ============================================================
// 1. ジャンル定義
// ============================================================
test('genres: 5ジャンル定義とGENRE_BY_KEYが整合', () => {
  assert.equal(GENRES.length, 5)
  for (const g of GENRES) {
    assert.ok(g.key && g.label && g.gameType && g.sheetHint && g.placeholder)
    assert.equal(GENRE_BY_KEY[g.key], g)
  }
  assert.equal(GENRE_BY_KEY.yugioh.hasRarity, true)
  assert.equal(GENRE_BY_KEY.yugioh.hasExpansion, true)
  assert.ok(HEADER_ALIASES.name.includes('ガチャ選択肢名称'))
})

// ============================================================
// 2. 価格計算
// ============================================================
test('pricing: 掛け率%（値引き）+ 端数繰り上げ', () => {
  assert.equal(computeDisplayPrice(185498, { ...DEFAULT_PRICING, ratePercent: -2.7, unit: 100, rounding: 'ceil' }), 180500)
})
test('pricing: 定額調整（−500円）', () => {
  assert.equal(computeDisplayPrice(10000, { ...DEFAULT_PRICING, flatAdjust: -500, unit: 100, rounding: 'ceil' }), 9500)
})
test('pricing: 上乗せ（+10%）', () => {
  assert.equal(computeDisplayPrice(10000, { ...DEFAULT_PRICING, ratePercent: 10, unit: 100, rounding: 'ceil' }), 11000)
})
test('pricing: 金額帯ルールが基本掛け率より優先', () => {
  const p = { ...DEFAULT_PRICING, ratePercent: 10, tiers: [{ min: 10000, max: 100000, ratePercent: -5, flatAdjust: 0 }], unit: 100, rounding: 'ceil' }
  assert.equal(computeDisplayPrice(50000, p), 47500)   // tier(-5%)適用
  assert.equal(computeDisplayPrice(5000, p), 5500)     // 帯外→基本(+10%)
})
test('pricing: 金額帯ごとに端数の単位・丸め方向を個別指定できる', () => {
  const p = {
    ...DEFAULT_PRICING, ratePercent: 0, unit: 100, rounding: 'ceil',
    tiers: [
      { min: 0, max: 9999, ratePercent: 0, flatAdjust: 0, unit: 1000, rounding: 'floor' },   // 高額帯: 1000円切り捨て
      { min: 10000, max: '', ratePercent: 0, flatAdjust: 0 },                                  // 端数指定なし→基本(100/ceil)
    ],
  }
  // base=5500 → 帯1(1000円・切り捨て) → floor(5500/1000)*1000 = 5000
  assert.equal(computeDisplayPrice(5500, p), 5000)
  // base=12345 → 帯2(端数指定なし=基本100/ceil) → ceil(12345/100)*100 = 12400
  assert.equal(computeDisplayPrice(12345, p), 12400)
})
test('pricing: 既存の帯(端数指定なし)は基本の端数・丸めに従う（後方互換）', () => {
  const p = { ...DEFAULT_PRICING, unit: 500, rounding: 'round', tiers: [{ min: 0, max: '', ratePercent: 0, flatAdjust: 0 }] }
  // 1250 → round(1250/500)*500 = round(2.5)*500 = 3*500 = 1500
  assert.equal(computeDisplayPrice(1250, p), 1500)
})
test('pricing: 端数 floor / round', () => {
  assert.equal(computeDisplayPrice(12345, { ...DEFAULT_PRICING, unit: 100, rounding: 'floor' }), 12300)
  assert.equal(computeDisplayPrice(12350, { ...DEFAULT_PRICING, unit: 100, rounding: 'round' }), 12400)
})
test('pricing: 無効なbaseは0', () => {
  for (const b of [0, -5, NaN, null, undefined, 'abc']) assert.equal(computeDisplayPrice(b), 0)
})

// ============================================================
// 3. パーサー（CSV/2次元配列）
// ============================================================
test('vaultParser: 基本パース・空名スキップ・id一意・統計', () => {
  const rows = [
    ['ガチャ選択肢名称', '種別', 'list_no', '画像', '仕入れ依頼数', '納品希望価格'],
    ['A', 'PSA10', '001', 'https://x/1.jpg', '5', '10000'],
    ['', 'PSA10', '002', '', '1', '9999'],   // 空名→スキップ
    ['B', '素体', '', '', '2', '0'],          // 型番なし・価格0
  ]
  const r = parseVaultRows(rows, 'pokemon')
  assert.equal(r.cards.length, 2)              // 空名は除外
  assert.equal(r.withPrice, 1)                 // 価格>0は1件
  assert.equal(r.withImage, 1)
  const ids = r.cards.map(c => c.id)
  assert.equal(new Set(ids).size, ids.length)  // id一意
})
test('vaultParser: 遊戯王は弾・レアリティを取得', () => {
  const rows = [
    ['ガチャ選択肢名称', '種別', 'list_no', '弾', 'レアリティ', '画像', '仕入れ依頼数', '納品希望価格'],
    ['青眼', 'PSA10', 'YG-1', 'LB-01', '20thシク', '', '1', '30000'],
  ]
  const r = parseVaultRows(rows, 'yugioh')
  assert.equal(r.cards[0].expansion, 'LB-01')
  assert.equal(r.cards[0].rarity, '20thシク')
})
test('vaultParser: 同一行データでも連番でid絶対一意', () => {
  // listNo空で名前も衝突しうる行を複数 → id衝突しないこと
  const rows = [
    ['ガチャ選択肢名称', '種別', '納品希望価格'],
    ['ミュウ', '素体', '3000'],
    ['ミュウ', '素体', '3000'],
    ['ミュウ', '素体', '3000'],
  ]
  const r = parseVaultRows(rows, 'pokemon')
  const ids = r.cards.map(c => c.id)
  assert.equal(ids.length, 3)
  assert.equal(new Set(ids).size, 3)           // 全て別id
})

// ============================================================
// 4. Excel取込パイプライン
// ============================================================
test('excel: 1ファイルから5ジャンルを分解取込・件数・id一意', async () => {
  const res = await parseExcelAllGenres(writeFile(buildWorkbook()))
  assert.equal(res.pokemon.cards.length, 3)        // 空名1件除外で3
  assert.equal(res.pokemon_old.cards.length, 1)
  assert.equal(res.onepiece.cards.length, 2)
  assert.equal(res.yugioh.cards.length, 1)
  assert.equal(res.weiss.cards.length, 1)
  // ジャンル横断でも id 一意
  const allIds = Object.values(res).flatMap(r => (r.cards || []).map(c => c.id))
  assert.equal(new Set(allIds).size, allIds.length)
  // 旧裏とポケモンが取り違えられていない（完全一致シート分離）
  assert.equal(res.pokemon_old.cards[0].name, 'リザードン(旧裏)')
})
test('excel: 該当シートが無いジャンルはnotFound', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ガチャ選択肢名称', '種別', '納品希望価格'], ['X', 'PSA10', '1000']]), 'ポケモン')
  const res = await parseExcelAllGenres(writeFile(wb))
  assert.equal(res.pokemon.cards.length, 1)
  assert.equal(res.onepiece.notFound, true)
})
test('excel単一: 先頭シートにフォールバックして読める', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['カード名', '種別', '希望価格'], ['単品', 'PSA10', '5000']]), '謎シート名')
  const out = await parseExcelSingleGenre(writeFile(wb), 'pokemon')
  assert.equal(out.usedFirstSheet, true)
  assert.equal(out.cards.length, 1)
  assert.equal(out.cards[0].name, '単品')
})

// ============================================================
// 5. カード識別キー / 定番リスト適用
// ============================================================
test('cardKey: list_no+種別+名前（遊戯王はレアリティも完全一致）', () => {
  assert.equal(cardKey({ listNo: '001', type: 'PSA10', name: 'A' }), '001|PSA10|A')
  assert.equal(cardKey({ listNo: '', type: '素体', name: 'B' }), '|素体|B')
  assert.equal(cardKey({ listNo: 'JP046', type: 'PSA10', name: 'サイバー', rarity: '20thシク' }), 'JP046|PSA10|サイバー|20thシク')
  assert.equal(itemKey({ listNo: 'JP046', type: 'PSA10', name: 'サイバー', rarity: '20thシク' }), 'JP046|PSA10|サイバー|20thシク')
})
test('applyList: ポケモン等(レアリティ無し)の同型番・別カードを取り違えない（実事故再現: 114/100）', () => {
  // 2026-06-10 実事故: ピカチュウVMAX HR と シロナの覇気 SR が同型番[114/100]で、
  // 旧ロジック(型番+種別のみ)だと先の行のシロナに化けた。名前込みキーで防ぐ
  const all = [
    { id: 'p_114_163', listNo: '114/100', type: 'PSA10', name: 'シロナの覇気 SR', basePrice: 15300 },
    { id: 'p_114_274', listNo: '114/100', type: 'PSA10', name: 'ピカチュウVMAX HR', basePrice: 113220 },
  ]
  const items = cardsToItems([all[1]])               // ピカチュウVMAX HRだけ登録
  const r = applyList(items, all)
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'p_114_274', 'シロナに化けずピカチュウVMAX HRを解決')
})
test('applyList: 遊戯王の同list_no異弾を取り違えない（名前で区別）', () => {
  // 弾は違うが list_no="JP001" が同じ別カード（実データで26枚衝突していたケース）
  const all = [
    { id: 'a', listNo: 'JP001', type: 'PSA10', rarity: '25th', name: 'ブルーアイズ' },
    { id: 'b', listNo: 'JP001', type: 'PSA10', rarity: '25th', name: '究極態グレートモス' },
  ]
  const items = cardsToItems([all[1], all[0]])      // モス→ブルーアイズの順で保存
  const r = applyList(items, all)
  assert.deepEqual(r.map(c => c.id), ['b', 'a'], '名前で正しく区別・保存順どおり')
})
test('applyList: 同list_no同名でレアリティ違いを区別（遊戯王）', () => {
  const all = [
    { id: 'a', listNo: 'JP001', type: 'PSA10', rarity: 'ウルトラ', name: '青眼' },
    { id: 'b', listNo: 'JP001', type: 'PSA10', rarity: '20thシク', name: '青眼' }, // 同名・レアリティ違い
  ]
  const items = cardsToItems([all[1], all[0]])
  const r = applyList(items, all)
  assert.deepEqual(r.map(c => c.id), ['b', 'a'], 'レアリティで区別・順序維持')
})
test('applyList: レアリティ未保存の既存リストもフォールバックで適用（後方互換）', () => {
  const all = [{ id: 'a', listNo: 'JP001', type: 'PSA10', rarity: '20th', name: 'ブルーアイズ' }]
  const legacyItems = [{ listNo: 'JP001', type: 'PSA10', name: 'ブルーアイズ' }] // 旧保存（rarity無し）
  const r = applyList(legacyItems, all)
  assert.equal(r.length, 1, '既存リストでも在庫切れにならない')
  assert.equal(r[0].id, 'a')
})
test('編集画面: 旧形式リスト(レアリティ未保存)でも登録済みカードを「未登録」と誤判定しない', () => {
  // 実バグ再現: 旧itemはrarity無し、カードはrarityあり → 文字列キー比較だと全件「未登録」になっていた
  const all = [
    { id: 'a', listNo: 'JP1', type: 'PSA10', rarity: '20th', name: '青眼' },
    { id: 'b', listNo: 'JP2', type: 'PSA10', rarity: '25th', name: 'ブラマジ' },
  ]
  const legacyItems = [
    { listNo: 'JP1', type: 'PSA10', name: '青眼' },
    { listNo: 'JP2', type: 'PSA10', name: 'ブラマジ' },
  ]
  const selected = applyList(legacyItems, all)             // リスト適用 = 全カード選択中
  // 編集画面のpending判定（id基準）
  const registeredIds = new Set(resolveItems(legacyItems, all).filter(Boolean).map(c => c.id))
  const pending = selected.filter(c => !registeredIds.has(c.id))
  assert.equal(pending.length, 0, '登録済みは未登録と表示されない（旧:全件誤表示）')
})
test('enrichItems: 旧形式itemにレアリティを補完（保存で新形式に移行）', () => {
  const all = [{ id: 'a', listNo: 'JP1', type: 'PSA10', rarity: '20th', name: '青眼' }]
  const enriched = enrichItems([{ listNo: 'JP1', type: 'PSA10', name: '青眼' }], all)
  assert.deepEqual(enriched, [{ listNo: 'JP1', type: 'PSA10', name: '青眼', rarity: '20th' }])
  // 在庫切れitemはそのまま残す
  const keep = enrichItems([{ listNo: 'ZZZ', type: 'PSA10', name: '無い' }], all)
  assert.deepEqual(keep, [{ listNo: 'ZZZ', type: 'PSA10', name: '無い' }])
})
test('dedupeItems: 旧+新形式の重複（取り込み事故）がenrich後に1件へ自己修復', () => {
  const all = [{ id: 'a', listNo: 'JP1', type: 'PSA10', rarity: '20th', name: '青眼' }]
  // 事故データ: 同じカードが旧形式と新形式で二重登録されている
  const corrupted = [
    { listNo: 'JP1', type: 'PSA10', name: '青眼' },
    { listNo: 'JP1', type: 'PSA10', name: '青眼', rarity: '20th' },
  ]
  const healed = dedupeItems(enrichItems(corrupted, all))
  assert.equal(healed.length, 1, '編集画面を開いて保存すれば重複が消える')
})
test('cardsToItems: レアリティ・画像URLがあれば保存 / 無ければ付けない', () => {
  assert.deepEqual(cardsToItems([{ listNo: 'JP1', type: 'PSA10', name: 'A', rarity: '20th', imageUrl: 'https://x/1.png' }]),
    [{ listNo: 'JP1', type: 'PSA10', name: 'A', rarity: '20th', img: 'https://x/1.png' }])
  assert.deepEqual(cardsToItems([{ listNo: '001', type: 'PSA10', name: 'B' }]),
    [{ listNo: '001', type: 'PSA10', name: 'B' }])
})
test('applyListWithMissing: 発注なしカードをゴースト表示（画像+前回価格・保存順維持）', () => {
  const all = [{ id: 'p1', listNo: '001', type: 'PSA10', name: 'A', basePrice: 5000, imageUrl: 'https://x/a.png' }]
  const items = [
    { listNo: '001', type: 'PSA10', name: 'A', img: 'https://x/a.png', base: 5000 },                  // 在庫あり
    { listNo: '999', type: 'PSA10', name: '発注なしカード', img: 'https://x/z.png', base: 10000 },     // 前回価格あり
    { listNo: '888', type: 'PSA10', name: '画像も価格も無い旧カード' },                                  // 旧形式
  ]
  const priceOf = (b) => Math.ceil(b * 0.94 / 100) * 100  // 店舗の価格ルール(-6%)を模擬
  const r = applyListWithMissing(items, all, priceOf)
  assert.equal(r.length, 3, '在庫切れもスキップせず全件並ぶ')
  assert.equal(r[0].id, 'p1', '在庫ありは実カード')
  assert.equal(r[1].missing, true)
  assert.equal(r[1].imageUrl, 'https://x/z.png', '保存済み画像URLで表示できる')
  assert.equal(r[1].price, 9400, '前回基準価格に今日の価格ルールを適用して表示')
  assert.equal(r[1].priceIsLast, true, '「前回」マークが付く')
  assert.equal(r[2].price, 0, '前回価格が無ければ「-」表示')
  assert.equal(r[2].priceIsLast, false)
  assert.equal(new Set(r.map(c => c.id)).size, 3, 'ゴーストidも一意（増殖しない）')
})
test('mergeMissingIntoSelection: チェックONで発注なし分だけをリスト順の位置に差し込む', () => {
  const real1 = { id: 'r1', listNo: '1', type: 'PSA10', name: 'A' }
  const real2 = { id: 'r2', listNo: '2', type: 'PSA10', name: 'B' }
  const ghost = { id: 'missing_1_x', listNo: '9', type: 'PSA10', name: 'ナシ', missing: true }
  const manual = { id: 'm1', listNo: '7', type: 'PSA10', name: '手動追加' }
  // リスト順: A → ナシ(発注なし) → B / 現在の選択: A, B, 手動追加
  const full = [real1, ghost, real2]
  const merged = mergeMissingIntoSelection([real1, real2, manual], full)
  assert.deepEqual(merged.map(c => c.id), ['r1', 'missing_1_x', 'r2', 'm1'], 'ゴーストはAとBの間・手動追加は末尾のまま')
  // OFF相当: missingを外すと元に戻る
  assert.deepEqual(merged.filter(c => !c.missing).map(c => c.id), ['r1', 'r2', 'm1'])
  // 再度ONしても二重に増えない
  const again = mergeMissingIntoSelection(merged, full)
  assert.deepEqual(again.map(c => c.id), ['r1', 'missing_1_x', 'r2', 'm1'], '冪等（増殖しない）')
  // ユーザーが消した実カードは復活しない
  const afterDelete = mergeMissingIntoSelection([real2], full)
  assert.deepEqual(afterDelete.map(c => c.id), ['missing_1_x', 'r2'], '消したAは復活せずゴーストのみ差し込み')
})
test('cardsToItems/enrichItems: 前回読み込み価格(base)を保存・適用ごとに最新化・在庫切れ中は維持', () => {
  // 保存時にbasePriceをbaseとして保存
  assert.equal(cardsToItems([{ listNo: '1', type: 'PSA10', name: 'A', basePrice: 5000 }])[0].base, 5000)
  // 在庫ありなら今日の価格で更新
  const all = [{ id: 'p1', listNo: '1', type: 'PSA10', name: 'A', basePrice: 7777 }]
  assert.equal(enrichItems([{ listNo: '1', type: 'PSA10', name: 'A', base: 5000 }], all)[0].base, 7777)
  // 在庫切れ中は前回値を維持
  assert.equal(enrichItems([{ listNo: '9', type: 'PSA10', name: 'ナシ', base: 5000 }], all)[0].base, 5000)
})
test('全ジャンル手動価格: 当日は前回表示を消し、翌日も発注なしなら同額のまま前回価格を再表示', () => {
  const item = { listNo: '1', type: 'PSA10', name: 'A', base: 10000 }
  // ① 発注なし表示 → 手動で8000円に修正（CardSelectorのcommitEdit相当）
  const daily = (todayKey) => ({ restorePreviousPriceDaily: true, todayKey })
  let ghost = applyListWithMissing([item], [], b => b, daily('2026-08-09'))[0]
  assert.equal(ghost.priceIsLast, true, '修正前は前回価格マーク')
  ghost = { ...ghost, price: 8000, priceManual: true, priceIsLast: false }
  // ② リストへ自動書き戻し
  const { next, changed, matchedCount } = applyManualPricesToItems([item], [ghost], { editedOn: '2026-08-09' })
  assert.equal(changed, true)
  assert.equal(matchedCount, 1)
  assert.equal(next[0].manualPrice, 8000, '手動価格がDBに保存される')
  assert.equal(next[0].manualEditedOn, '2026-08-09', '店舗リスト項目に日本日付を保存する')
  // ③ 同日は手動価格扱いのまま（前回価格マークなし）
  const sameDay = applyListWithMissing(next, [], b => b, daily('2026-08-09'))[0]
  assert.equal(sameDay.price, 8000)
  assert.equal(sameDay.priceIsLast, false)
  // ④ 翌日も発注なし → 前日の手動価格を維持しつつ「前回価格」を再表示
  const nextDay = applyListWithMissing(next, [], b => b, daily('2026-08-10'))[0]
  assert.equal(nextDay.price, 8000)
  assert.equal(nextDay.priceIsLast, true, '日をまたいだら前回価格マークが復活する')
  assert.equal(nextDay.priceManual, true, '前日の確定額は掛け率変更で再計算しない')
  assert.equal(nextDay.manualEditedOn, '2026-08-09', '上書き保存でも編集日を失わない')
  assert.equal(nextDay.priceEditPending, undefined, '表示しただけでは手動編集待ちにしない')
  assert.deepEqual(cardsToItems([nextDay])[0], {
    listNo: '1', type: 'PSA10', name: 'A', base: 10000, manualPrice: 8000, manualEditedOn: '2026-08-09',
  }, '発注なしゴーストを「選択中で上書き」しても手動価格と編集日を維持')
  // ⑤ 翌日に同額で確定し直しても編集日が更新され、その日はマークが消える
  const clearedAgain = { ...nextDay, priceIsLast: false, priceManual: true }
  const { next: day2Saved, changed: day2Changed } = applyManualPricesToItems(next, [clearedAgain], { editedOn: '2026-08-10' })
  assert.equal(day2Changed, true, '金額が同じでも日付更新を保存する')
  assert.equal(day2Saved[0].manualEditedOn, '2026-08-10')
  assert.equal(applyListWithMissing(day2Saved, [], b => b, daily('2026-08-10'))[0].priceIsLast, false)
  // ④ 「要相談」等の文字も保存できる
  const { next: nt } = applyManualPricesToItems(next, [{ ...nextDay, priceManual: false, priceText: '要相談' }], { editedOn: '2026-08-10' })
  assert.equal(nt[0].manualText, '要相談')
  assert.equal(nt[0].manualPrice, undefined, '数値と文字は排他')
  // ⑤ 在庫が戻ったら実価格優先で手動値は自動解除
  const restocked = enrichItems(next, [{ id: 'r1', listNo: '1', type: 'PSA10', name: 'A', basePrice: 12000 }])
  assert.equal(restocked[0].manualPrice, undefined, '在庫復活でExcel実価格が優先')
  assert.equal(restocked[0].manualEditedOn, undefined, '編集日も自動解除')
  assert.equal(restocked[0].base, 12000)
  // ⑥ 変更がなければ書き戻しは発生しない（無限保存ループ防止）
  const { changed: c2 } = applyManualPricesToItems(next, [sameDay], { editedOn: '2026-08-09' })
  assert.equal(c2, false)
  const unmatched = applyManualPricesToItems([item], [{ ...sameDay, name: '別カード' }], { editedOn: '2026-08-09' })
  assert.equal(unmatched.matchedCount, 0, '対象なしを同額保存済みと区別できる')
  const atMidnight = applyManualPricesToItems([item], [{ ...ghost, priceEditEditedOn: '2026-08-09' }], { editedOn: '2026-08-10' })
  assert.equal(atMidnight.next[0].manualEditedOn, '2026-08-09', '保存開始時ではなく編集確定時の日本日付を優先')
})
test('全5ジャンルで日次の前回価格復活を使い、事前登録は対象外', () => {
  assert.equal(GENRES.every(g => usesDailyPreviousPrice(g.key)), true, '5ジャンルすべて同じ日次仕様')
  const edited = { listNo: '1', type: 'PSA10', name: 'A', base: 10000, manualPrice: 8000, manualEditedOn: '2026-08-09' }
  const otherGenre = applyListWithMissing([edited], [], b => b, { restorePreviousPriceDaily: true, todayKey: '2026-08-10' })[0]
  assert.equal(otherGenre.priceIsLast, true, 'ポケモン以外も翌日は前回価格を再表示')
  const legacyPokemon = { listNo: '9', type: 'PSA10', name: '旧保存データ', base: 10000, manualPrice: 8000 }
  const legacy = applyListWithMissing([legacyPokemon], [], b => b, { restorePreviousPriceDaily: true, todayKey: '2026-08-10' })[0]
  assert.equal(legacy.priceIsLast, true, '導入前の手動価格も基準価格があれば前回価格として移行する')
  const preRegistered = { listNo: '2', type: 'PSA10', name: '事前登録', manualPrice: 50000 }
  const pre = applyListWithMissing([preRegistered], [], b => b, { restorePreviousPriceDaily: true, todayKey: '2026-08-10' })[0]
  assert.equal(pre.priceIsLast, false, '編集日のない事前登録価格は前回価格ではない')
  const editedPre = applyListWithMissing([{ ...preRegistered, manualEditedOn: '2026-08-09' }], [], b => b, { restorePreviousPriceDaily: true, todayKey: '2026-08-10' })[0]
  assert.equal(editedPre.priceIsLast, false, '事前登録は編集後も発注実績がないため前回価格ではない')
})
test('tokyoDateKey: UTC日付ではなく日本時間の日付を返す', () => {
  assert.equal(tokyoDateKey(new Date('2026-08-09T15:30:00.000Z')), '2026-08-10')
})
test('cardsToCsv: 現在の買取表だけを表示順・価格・状態つきでExcel向け出力', () => {
  const csv = cardsToCsv([
    { name: 'ピカチュウ,ex', listNo: '001', type: 'PSA10', rarity: 'SAR', price: 12000, missing: false, priceIsLast: false },
    { name: 'リザードン"ex', listNo: '002', type: 'PSA10', price: 8000, missing: true, priceIsLast: true },
  ])
  assert.equal(csv.charCodeAt(0), 0xFEFF, 'Excel文字化け防止のBOM付き')
  const rows = csv.slice(1).split('\r\n')
  assert.equal(rows.length, 3, 'ヘッダー＋現在表示中2件だけ')
  assert.match(rows[1], /^"1","ピカチュウ,ex"/)
  assert.match(rows[2], /^"2","リザードン""ex"/)
  assert.match(rows[2], /"8000","発注なし","○"$/)
  const safe = cardsToCsv([{ name: '=HYPERLINK("https://example.com")', priceText: '+1' }])
  assert.match(safe, /"'=HYPERLINK\(""https:\/\/example\.com""\)"/, 'Excel数式として実行させない')
  assert.match(safe, /"'\+1"/, '価格テキストも数式として実行させない')
})
test('型番アンカー救済: 型番が一意なら名称が変わっても自動で引き継ぐ（新旧名称ズレ対策）', () => {
  // 新形式で「名称」がvariant分離により変わっても、型番+種別が一意なら安全に自動解決する。
  const items = [
    { listNo: '114/100', type: 'PSA10', name: 'ピカチュウVMAX HR' },   // 旧: 名称にレア内包
    { listNo: '001/100', type: 'PSA10', name: 'アイリス' },            // 名称も一致
    { listNo: '999/999', type: 'PSA10', name: '完売カード' },           // 新データに無い→在庫切れ
  ]
  const all = [
    { id: 'c1', listNo: '114/100', type: 'PSA10', name: 'ピカチュウVMAX', rarity: 'HR' }, // 新: 素名+レア分離
    { id: 'c2', listNo: '001/100', type: 'PSA10', name: 'アイリス' },
  ]
  const resolved = applyList(items, all)
  assert.equal(resolved.length, 2, '在庫あり2件が引き継がれる（完売1件は除外）')
  assert.equal(resolved[0].id, 'c1', '名称が違っても型番一意で自動引継')
  assert.equal(resolved[1].id, 'c2')
  // 型番が一意な自動解決は「改名疑い」として人手確認に回さない（うざくしない・96%自動の要）
  assert.equal(detectRenamedCards(items, all).length, 0, '一意解決は改名疑いにしない')
})
test('曖昧な複数候補は自動結合せず在庫切れ扱い＋改名候補として提示（安全側）', () => {
  // 同一型番に別カードが複数（名称でも絞れない）→ 推測で結合しない。
  const items = [{ listNo: 'JP020', type: 'PSA10', name: '謎のカード' }]
  const all = [
    { id: 'a', listNo: 'JP020', type: 'PSA10', name: 'カードA' },
    { id: 'b', listNo: 'JP020', type: 'PSA10', name: 'カードB' },
  ]
  assert.equal(applyList(items, all).length, 0, '曖昧は自動結合しない（在庫切れ扱い）')
  assert.equal(detectRenamedCards(items, all).length, 1, '人が選べるよう候補提示に回す')
})
test('名前変更検知: 遊戯王はレアリティ一致を要求・複数候補でも包含で1枚に絞れれば自動解決', () => {
  // レアリティ違いは候補にしない
  const sus1 = detectRenamedCards(
    [{ listNo: 'JP1', type: 'PSA10', name: '青眼', rarity: '20th' }],
    [{ id: 'x', listNo: 'JP1', type: 'PSA10', name: '青き眼', rarity: 'ウルトラ' }]
  )
  assert.equal(sus1.length, 0, 'レアリティ不一致は改名候補にしない')
  // 複数候補でも名前の包含関係で1枚に絞れる場合は自動解決される（候補提示ではなく）
  const items = [{ listNo: 'JP1', type: 'PSA10', name: 'ブラックマジシャン(25th)' }]
  const all = [
    { id: 'a', listNo: 'JP1', type: 'PSA10', name: '真紅眼の黒竜' },
    { id: 'b', listNo: 'JP1', type: 'PSA10', name: '黒き魔術師ブラックマジシャン(25th)' },
  ]
  const resolved = applyList(items, all)
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].id, 'b', '包含関係のある1枚に自動解決（親和性ゼロのaには行かない）')
  assert.equal(detectRenamedCards(items, all).length, 0, '解決済みなので候補提示は不要')
})
test('事前登録: Excelに無いカードを登録→ゴースト表示→発注が来たら実カードに自動切替', () => {
  // ① 事前登録（手入力: 名前・型番・種別・画像URL・表示価格）
  const pre = { listNo: '300/200', type: 'PSA10', name: '新弾ピカチュウ', img: 'https://x/new.png', manualPrice: 50000 }
  // ② まだExcelに無い → 発注なし表示で画像+入力価格のゴーストとして出る
  const ghost = applyListWithMissing([pre], [], b => b)[0]
  assert.equal(ghost.missing, true)
  assert.equal(ghost.name, '新弾ピカチュウ')
  assert.equal(ghost.imageUrl, 'https://x/new.png')
  assert.equal(ghost.price, 50000, '入力した表示価格で出る')
  assert.equal(ghost.priceIsLast, false, '前回価格マークは付かない（手入力価格）')
  // ③ 後日Excelに載った → 実カードとして解決され、手入力価格は実価格に自動切替
  const real = { id: 'r1', listNo: '300/200', type: 'PSA10', name: '新弾ピカチュウ', basePrice: 60000, imageUrl: 'https://x/real.png' }
  const resolved = applyList([pre], [real])
  assert.equal(resolved.length, 1)
  assert.equal(resolved[0].id, 'r1', 'キー一致で実カードに解決')
  const migrated = enrichItems([pre], [real])[0]
  assert.equal(migrated.base, 60000, '実価格が前回価格として保存される')
  assert.equal(migrated.manualPrice, undefined, '手入力価格は自動解除')
})
test('前回価格のライフサイクル: 作成時の金額に固定されず、Excelを読むたび最新化される', () => {
  const item = { listNo: '1', type: 'PSA10', name: 'A' }
  // Day1: リスト作成（その日の価格10000で保存）
  let saved = enrichItems([item], [{ id: 'd1', ...item, basePrice: 10000 }])
  assert.equal(saved[0].base, 10000)
  // Day2: 新しいExcel（価格12000に変動）→ 適用/チェックONで自動更新
  saved = enrichItems(saved, [{ id: 'd2', ...item, basePrice: 12000 }])
  assert.equal(saved[0].base, 12000, '作成時の10000ではなく最新の12000に更新')
  // Day3: 発注なし → 直近の12000を保持（10000には戻らない）
  saved = enrichItems(saved, [{ id: 'x', listNo: '99', type: 'PSA10', name: '別物', basePrice: 1 }])
  assert.equal(saved[0].base, 12000, '在庫切れ中は「最後に在庫があった日」の価格を保持')
})
test('enrichItems: 画像URLも補完保存（在庫切れ項目の既存imgは維持）', () => {
  const all = [{ id: 'p1', listNo: '001', type: 'PSA10', name: 'A', imageUrl: 'https://x/a.png' }]
  const out = enrichItems([
    { listNo: '001', type: 'PSA10', name: 'A' },                              // 旧形式→img補完される
    { listNo: '999', type: 'PSA10', name: 'ナシ', img: 'https://x/keep.png' }, // 在庫切れ→img維持
  ], all)
  assert.equal(out[0].img, 'https://x/a.png')
  assert.equal(out[1].img, 'https://x/keep.png')
})
test('applyList: 適用・在庫切れスキップ・登録順保持', () => {
  const all = [
    { id: 'p1', listNo: '001', type: 'PSA10', name: 'A' },
    { id: 'p2', listNo: '002', type: 'PSA10', name: 'B' },
  ]
  const items = [
    { listNo: '002', type: 'PSA10', name: 'B' },
    { listNo: '999', type: 'PSA10', name: '在庫切れ' }, // スキップ
    { listNo: '001', type: 'PSA10', name: 'A' },
  ]
  const r = applyList(items, all)
  assert.deepEqual(r.map(c => c.id), ['p2', 'p1'])  // 登録順・在庫切れ除外
})
test('applyList: 同一カードを二重に拾わない（増殖防止）', () => {
  const all = [{ id: 'p1', listNo: '001', type: 'PSA10', name: 'A' }]
  const items = [{ listNo: '001', type: 'PSA10', name: 'A' }, { listNo: '001', type: 'PSA10', name: 'A' }]
  assert.equal(applyList(items, all).length, 1)
})
test('cardsToItems: 保存用の最小項目に変換（順序保持・priceは保存しない）', () => {
  const cards = [{ id: 'x', listNo: '001', type: 'PSA10', name: 'A', price: 999, imageUrl: 'https://x/u.png' }]
  assert.deepEqual(cardsToItems(cards), [{ listNo: '001', type: 'PSA10', name: 'A', img: 'https://x/u.png' }])
})
test('applyList: 遊戯王の同番号・異レアリティ（キー衝突）を全件拾う・順序維持', () => {
  // 同じ list_no + 種別 でレアリティだけ違う3枚（cardKeyは衝突する）
  const all = [
    { id: 'y1', listNo: 'YG-1', type: 'PSA10', rarity: 'ノーマル', name: '青眼' },
    { id: 'y2', listNo: 'YG-1', type: 'PSA10', rarity: 'レリーフ', name: '青眼' },
    { id: 'y3', listNo: 'YG-1', type: 'PSA10', rarity: 'シークレット', name: '青眼' },
    { id: 'y4', listNo: 'YG-2', type: 'PSA10', rarity: 'シク', name: 'ブラマジ' },
  ]
  const items = cardsToItems(all)              // 4件保存（= リスト中身）
  const r = applyList(items, all)
  assert.equal(r.length, 4, '4枚すべて拾える（旧仕様だとYG-1が1枚に潰れ在庫切れ）')
  assert.deepEqual(r.map(c => c.id), ['y1', 'y2', 'y3', 'y4'], '保存順を維持')
})
test('applyList: キー衝突カードで在庫が一部欠けても登録数まで割り当て', () => {
  // 登録は3枚ぶん。今日のデータは同キー2枚しか無い → 2枚拾い、不足1枚は在庫切れ
  const items = [
    { listNo: 'YG-1', type: 'PSA10', name: '青眼' },
    { listNo: 'YG-1', type: 'PSA10', name: '青眼' },
    { listNo: 'YG-1', type: 'PSA10', name: '青眼' },
  ]
  const all = [
    { id: 'y1', listNo: 'YG-1', type: 'PSA10', rarity: 'ノーマル', name: '青眼' },
    { id: 'y2', listNo: 'YG-1', type: 'PSA10', rarity: 'レリーフ', name: '青眼' },
  ]
  const r = applyList(items, all)
  assert.equal(r.length, 2)
  assert.deepEqual(r.map(c => c.id), ['y1', 'y2'])
})

// ============================================================
// 6. 定番リスト 全フロー（中心） — UIロジックを写経して検証
//    ※ CardListPanel / CardListEditor / CardSelector と同一ロジック
// ============================================================
// selectedの一意化（App.setActiveSelected と同一）
const dedupeSelected = (raw) => {
  const seen = new Set()
  return (raw || []).filter(c => (c && c.id != null && !seen.has(c.id)) ? (seen.add(c.id), true) : false)
}
// 「選択中を追加」差分判定（CardListPanel.handleAddCurrent と同一）
const computeAdds = (listItems, allCards, cards) => {
  const listIds = new Set(applyList(listItems || [], allCards).map(c => c.id))
  const seenKey = new Set()
  return cards.filter(c => !listIds.has(c.id) && !seenKey.has(cardKey(c)) && seenKey.add(cardKey(c)))
    .map(c => ({ listNo: c.listNo || '', type: c.type || '', name: c.name }))
}
// 編集画面の「取り込むバー」pending（CardListEditor と同一）
const computePending = (items, cards) => {
  const seen = new Set((items || []).map(cardKey))
  const out = []
  for (const c of cards || []) { const k = cardKey(c); if (!seen.has(k)) { seen.add(k); out.push(c) } }
  return out
}
// 並び替え（CardSelector.moveCard と同一）
const moveCard = (arr, from, to) => {
  if (to < 0 || to >= arr.length) return arr
  const a = [...arr]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return a
}

const sampleCards = [
  { id: 'p1', listNo: '001/100', type: 'PSA10', name: 'アイリス', price: 25000 },
  { id: 'p2', listNo: '002/100', type: 'PSA10', name: 'カイ', price: 13000 },
  { id: 'p3', listNo: '055/100', type: 'PSA10', name: 'リーリエ', price: 9000 },
  { id: 'p4', listNo: '', type: '素体', name: 'ミュウ', price: 3000 },     // 型番なし
  { id: 'p5', listNo: '', type: '素体', name: 'ミュウ', price: 3000 },     // 型番なし・同名同種別の別カード
]

test('リスト: 作成直後（空）に適用しても0件', () => {
  assert.equal(applyList([], sampleCards).length, 0)
})
test('リスト: 選択→保存(cardsToItems)→適用で復元（順序保持）', () => {
  const selected = [sampleCards[1], sampleCards[0]]          // カイ→アイリスの順で選択
  const items = cardsToItems(selected)                       // 保存
  const restored = applyList(items, sampleCards)             // 翌日のデータに適用
  assert.deepEqual(restored.map(c => c.id), ['p2', 'p1'])    // 保存した順で復元
})
test('リスト: 「選択中を追加」は未登録分のみ（型番ありカード）', () => {
  const listItems = cardsToItems([sampleCards[0], sampleCards[1]]) // アイリス・カイ登録
  const selected = [...applyList(listItems, sampleCards), sampleCards[2]] // +リーリエ追加
  const adds = computeAdds(listItems, sampleCards, selected)
  assert.equal(adds.length, 1)
  assert.equal(adds[0].name, 'リーリエ')
})
test('リスト: 型番なしの別カードも追加できる（id判定・誤「登録済み」回避）', () => {
  const listItems = cardsToItems([sampleCards[3]])           // ミュウ(p4)を登録
  const applied = applyList(listItems, sampleCards)          // = [p4]
  const selected = [...applied, sampleCards[4]]              // + 別ミュウ(p5)
  const adds = computeAdds(listItems, sampleCards, selected)
  assert.equal(adds.length, 1)                               // p5は別idなので追加対象
  assert.equal(adds[0].name, 'ミュウ')
})
test('リスト: 全て登録済みなら追加0件', () => {
  const listItems = cardsToItems([sampleCards[0], sampleCards[1]])
  const selected = applyList(listItems, sampleCards)
  assert.equal(computeAdds(listItems, sampleCards, selected).length, 0)
})
test('リスト編集: 取り込みバーは選択中の未登録分を出す', () => {
  const items = cardsToItems([sampleCards[0]])               // アイリスのみ登録
  const selected = [sampleCards[0], sampleCards[1], sampleCards[2]]
  const pending = computePending(items, selected)
  assert.equal(pending.length, 2)                            // カイ・リーリエ
  assert.deepEqual(pending.map(c => c.id), ['p2', 'p3'])
})
test('選択: 増殖防止（selectedにid重複が入っても一意化）', () => {
  const withDup = [sampleCards[0], sampleCards[1], sampleCards[0]]
  assert.deepEqual(dedupeSelected(withDup).map(c => c.id), ['p1', 'p2'])
})
test('選択: 並び替えで件数不変・重複なし', () => {
  let sel = sampleCards.slice(0, 4).map(c => c.id)
  sel = moveCard(sel, 0, 2)
  assert.deepEqual(sel, ['p2', 'p3', 'p1', 'p4'])
  assert.equal(new Set(sel).size, sel.length)
})

// ============================================================
// 6.5 並べ替え（単体・複数ブロック移動）
// ============================================================
test('moveBlockByIndex: 複数選択をブロックで移動（上下・順序保持・無効ドロップ）', async () => {
  const { moveBlockByIndex, moveOne } = await import('../src/lib/reorder.js')
  const arr = ['A', 'B', 'C', 'D', 'E']
  // 下方向: A,Bを Dの位置へ → C D A B E ではなく moveOne意味論で C,D,(A,B),E
  assert.deepEqual(moveBlockByIndex(arr, new Set([0, 1]), 3), ['C', 'D', 'A', 'B', 'E'])
  // 上方向: D,Eを Bの位置へ → A D E B C
  assert.deepEqual(moveBlockByIndex(arr, new Set([3, 4]), 1), ['A', 'D', 'E', 'B', 'C'])
  // 飛び飛び選択(A,C)を Eへ → B D E A C? 下方向なのでEの後ろ → B D E A C
  assert.deepEqual(moveBlockByIndex(arr, new Set([0, 2]), 4), ['B', 'D', 'E', 'A', 'C'])
  // 選択中の要素へのドロップは何もしない
  assert.deepEqual(moveBlockByIndex(arr, new Set([0, 1]), 1), arr)
  // moveOneとの整合（1件ブロック=moveOneと同結果）
  assert.deepEqual(moveBlockByIndex(arr, new Set([0]), 2), moveOne(arr, 0, 2))
  assert.deepEqual(moveBlockByIndex(arr, new Set([4]), 0), moveOne(arr, 4, 0))
})
test('moveBlockById: id基準のブロック移動（プレビュー/選択中で使用）', async () => {
  const { moveBlockById } = await import('../src/lib/reorder.js')
  const arr = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  assert.deepEqual(moveBlockById(arr, ['a', 'b'], 'd').map(c => c.id), ['c', 'd', 'a', 'b'])
  assert.deepEqual(moveBlockById(arr, ['d'], 'a').map(c => c.id), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveBlockById(arr, ['a'], '存在しない').map(c => c.id), ['a', 'b', 'c', 'd'])
})

// ============================================================
// 7. 設定デフォルト（出力に必要なキーが揃っているか）
// ============================================================
test('settings: DEFAULT_SETTINGS が主要キーを網羅', () => {
  const required = [
    'ratePercent', 'priceFlatAdjust', 'priceTiers', 'priceUnit', 'priceRounding',
    'canvasWidth', 'canvasHeight', 'gridColumns', 'gridRows', 'cardWidth', 'cardHeight',
    'headerText', 'showCardName', 'showListNo', 'showRarityOverlay', 'rarityAliases', 'rarityHidden',
    'priceFontSize', 'priceColor', 'showUpdateDate', 'footerText', 'fillEmptySlots', 'placeholderImage',
  ]
  for (const k of required) assert.ok(k in DEFAULT_SETTINGS, `欠落キー: ${k}`)
  // pricing設定がそのままcomputeDisplayPriceに渡せる形か
  const p = { ratePercent: DEFAULT_SETTINGS.ratePercent, flatAdjust: DEFAULT_SETTINGS.priceFlatAdjust, tiers: DEFAULT_SETTINGS.priceTiers, unit: DEFAULT_SETTINGS.priceUnit, rounding: DEFAULT_SETTINGS.priceRounding }
  assert.equal(computeDisplayPrice(10000, p), 10000) // 既定(rate0/flat0/unit100)は素通り
})

// ============================================================
// 8. 実戦統合シナリオ（増殖防止+id一意+選択追加+取り込み+遊戯王プールを1フローで）
// ============================================================
test('統合: 遊戯王101件(キー衝突多数)を 適用→追加→並び替え→編集 まで破綻なし', () => {
  const rarities = ['ノーマル', 'レア', 'スーパー', 'ウルトラ', 'シークレット', 'レリーフ', '20thシク']
  const allCards = []
  for (let i = 0; i < 101; i++) {
    const no = `YG-${Math.floor(i / 3) + 1}`   // 3枚ごとに同型番 = キー衝突を多数作る
    allCards.push({ id: `yugioh_${no}_${i}`, listNo: no, type: 'PSA10', rarity: rarities[i % 7], name: `カード${Math.floor(i / 3) + 1}`, price: 1000 + i * 100 })
  }
  const items = cardsToItems(allCards)
  assert.equal(items.length, 101)

  // 適用: 101件・在庫切れ0・id一意・保存順維持（旧仕様だと57件に潰れていた）
  const applied = applyList(items, allCards)
  assert.equal(applied.length, 101, '在庫切れ0で全件拾える')
  assert.equal(new Set(applied.map(c => c.id)).size, 101, 'id重複なし')
  assert.deepEqual(applied.map(c => c.id), allCards.map(c => c.id), '保存順を維持')

  // 未選択からリスト外3枚を追加（うち2枚は型番なし同名）
  const extra = [
    { id: 'x1', listNo: 'NEW-1', type: 'PSA10', rarity: 'レア', name: '新規A', price: 5000 },
    { id: 'x2', listNo: '', type: '素体', rarity: '', name: '新規B', price: 3000 },
    { id: 'x3', listNo: '', type: '素体', rarity: '', name: '新規B', price: 3000 },
  ]
  const today = [...allCards, ...extra]
  let selected = dedupeSelected([...applied, ...extra])
  assert.equal(selected.length, 104, '増殖なし・全件保持')

  // 並び替えで件数不変・重複なし
  selected = moveCard(selected, 0, 50)
  assert.equal(selected.length, 104)
  assert.equal(new Set(selected.map(c => c.id)).size, 104)

  // 「選択中を追加」: リスト未登録分のみ（型番なし同名は1件に集約=仕様の限界）
  const adds = computeAdds(items, today, selected)
  assert.equal(adds.length, 2, '新規A + 新規B(1件集約)')

  // 編集の取り込みバー: 同じく未登録分
  const pending = computePending(items, selected)
  assert.equal(pending.length, 2)
})
test('統合: 同じリストを再適用しても増殖しない（置換+dedupe）', () => {
  const items = cardsToItems([sampleCards[0], sampleCards[1], sampleCards[2]])
  let sel = dedupeSelected(applyList(items, sampleCards))
  assert.equal(sel.length, 3)
  sel = dedupeSelected(applyList(items, sampleCards))   // 2回目の適用
  assert.equal(sel.length, 3, '再適用で増えない')
})

// ============================================================
// 9. 新データ形式（order-list型・9列・商品ID付き・弾/レア分離）対応
// ============================================================
const NEW_HEAD = ['商品ID', '名称', '種別', 'エキスパンション', 'リスト番号', 'レアリティ', '画像', '募集数', '納品希望価格（税込）']

function buildNewWorkbook() {
  const wb = XLSX.utils.book_new()
  const sheets = {
    'ポケモン': [NEW_HEAD,
      ['pid-001', 'MゲンガーEX', 'PSA10', 'PROMO', '079/XY-P', 'PROMO', 'https://img/1.png', '13', '207,060'],
      ['pid-002', 'MゲンガーEX', 'PSA10', 'XY4', '034/088', 'RR', 'https://img/2.png', '12', '93,330'],
    ],
    'ポケモン(旧裏・カードe)': [NEW_HEAD,
      ['pid-old1', 'イーブイ', 'PSA10', 'プレミアムファイル2', '005/009', '-', 'https://img/o1.png', '2', '84,966'],
    ],
    'ワンピース': [NEW_HEAD,
      ['pid-op1', 'ルフィ', 'PSA10', 'OP01', 'OP01-001', 'L', 'https://img/op1.png', '2', '20,000'],
    ],
    '遊戯王': [NEW_HEAD,
      ['pid-yg1', '青眼の白龍', 'PSA10', 'QCCP', 'JP001', 'クォーターセンチュリーシークレット', '', '3', '75,990'],
    ],
    'ヴァイス': [NEW_HEAD,
      ['pid-w1', '“〈刻々帝〉”狂三', 'PSA10', 'デート・ア・ライブ', 'DAL/WE33-004SP', 'SP', 'https://img/w1.png', '9', '151,980'],
    ],
  }
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return wb
}

test('新形式: ヘッダー判定 detectFormat', () => {
  assert.equal(detectFormat(NEW_HEAD), 'new')
  assert.equal(detectFormat(['ガチャ選択肢名称', '種別', 'list_no']), 'old')
  assert.equal(detectFormat(['foo', 'bar']), 'unknown')
})

test('新形式: 名称/リスト番号/募集数/税込価格/商品IDを正しく読む', () => {
  const rows = [NEW_HEAD,
    ['pid-x', 'MレックウザEX', 'PSA10', 'XY7', '095/081', 'UR', 'https://img/x.png', '6', '638,520'],
  ]
  const r = parseVaultRows(rows, 'pokemon')
  assert.equal(r.total, 1)
  const c = r.cards[0]
  assert.equal(c.name, 'MレックウザEX')
  assert.equal(c.listNo, '095/081')
  assert.equal(c.type, 'PSA10')
  assert.equal(c.expansion, 'XY7', '弾を全ジャンルで読む')
  assert.equal(c.rarity, 'UR', 'レアを全ジャンルで読む')
  assert.equal(c.reqCount, 6, '募集数→reqCount')
  assert.equal(c.basePrice, 638520, 'カンマ付き税込価格を数値化')
  assert.equal(c.productId, 'pid-x', '商品IDを保持')
  assert.equal(c.id, 'pid-x', '商品IDをidに採用（安定）')
})

test('新形式: 1ファイルから5ジャンル一括パース（旧裏の新シート名・ヴァイスも拾う）', async () => {
  const file = writeFile(buildNewWorkbook())
  const res = await parseExcelAllGenres(file)
  assert.equal(res.pokemon.total, 2)
  assert.equal(res.pokemon_old.total, 1, '「ポケモン(旧裏・カードe)」を別名で検出')
  assert.ok(!res.pokemon_old.notFound)
  assert.equal(res.onepiece.total, 1)
  assert.equal(res.yugioh.total, 1)
  assert.equal(res.weiss.total, 1, 'ヴァイスも新形式で読む')
})

test('移行: 旧リスト（名称一体型・商品IDなし）が新データへ引き継がれる', () => {
  // 旧保存（名称にvariant内包・弾/商品IDなし）
  const oldItems = [
    { listNo: '079/XY-P', type: 'PSA10', name: 'MゲンガーEX(HOLLOW GEIST)' }, // 型番一意→自動
    { listNo: '034/088', type: 'PSA10', name: 'MゲンガーEX RR(PHANTOMGATE)' }, // 型番一意→自動
  ]
  const newCards = parseVaultRows(buildNewWorkbook().Sheets['ポケモン']
    ? XLSX.utils.sheet_to_json(buildNewWorkbook().Sheets['ポケモン'], { header: 1 }).map(r => r.map(c => c == null ? '' : String(c)))
    : [], 'pokemon').cards
  const resolved = applyList(oldItems, newCards)
  assert.equal(resolved.length, 2, '名称が違っても型番で両方引き継ぐ')
  assert.equal(resolved[0].productId, 'pid-001')
  assert.equal(resolved[1].productId, 'pid-002')
})

test('移行: enrich/cardsToItemsが商品ID・弾を保存し、2回目は商品IDで一発解決', () => {
  const newCards = [
    { id: 'pid-1', productId: 'pid-1', listNo: '079/XY-P', type: 'PSA10', name: 'MゲンガーEX', expansion: 'PROMO', rarity: 'PROMO', basePrice: 207060 },
  ]
  // 旧リストを一度enrich → 新形式キーへ移行
  const migrated = enrichItems([{ listNo: '079/XY-P', type: 'PSA10', name: 'MゲンガーEX(HOLLOW GEIST)' }], newCards)
  assert.equal(migrated[0].productId, 'pid-1', '商品IDが保存される')
  assert.equal(migrated[0].expansion, 'PROMO', '弾が保存される')
  // 以後は名称がどう変わっても商品IDで解決
  const renamed = [{ ...newCards[0], name: '全然ちがう名前' }]
  assert.equal(applyList(migrated, renamed).length, 1, '商品IDで名称非依存に解決')
  // cardsToItems も商品ID/弾を保存
  const items = cardsToItems(newCards)
  assert.equal(items[0].productId, 'pid-1')
  assert.equal(items[0].expansion, 'PROMO')
})

test('移行: BOX等の型番なし項目はアンカー救済の対象外（誤結合しない）', () => {
  // 型番なし（BOX）は名称一致でのみ解決。別BOXへ誤って吸着させない。
  const items = [{ listNo: '', type: 'PSA10', name: '[1BOX]クレイバースト' }]
  const cards = [
    { id: 'b1', listNo: '', type: 'PSA10', name: '[1BOX]サイバージャッジ' },
    { id: 'b2', listNo: '', type: 'PSA10', name: '[1BOX]クレイバースト' },
  ]
  const r = applyList(items, cards)
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'b2', '名称一致のBOXにだけ解決（型番空でアンカーしない）')
})

// ============================================================
// 10. 2026-07-29 リスト汚染事故の回帰テスト
//     型番は弾をまたいで再利用される（110/098 = ルギアV(S12) と ガルーラ(SV10)）。
//     「候補1枚だから」で名前無関係の別カードへ勝手に置換してはならない。
// ============================================================
test('事故再現: 型番一致でも名前無関係の別カードには置換しない（ルギアV→ガルーラ）', () => {
  const items = [{ listNo: '110/098', type: 'PSA10', name: 'ルギアV SRC' }]
  // 今日のExcelにはルギアVが不在、同型番のガルーラだけが居る
  const today = [{ id: 'g1', productId: 'g1', listNo: '110/098', type: 'PSA10', name: 'ガルーラ', expansion: 'SV10', rarity: 'AR', basePrice: 5500 }]
  assert.equal(applyList(items, today).length, 0, 'ガルーラに化けず在庫切れ扱い')
  // enrichItemsもリスト項目を書き換えない（自動保存で汚染が固定化しない）
  const enriched = enrichItems(items, today)
  assert.equal(enriched[0].name, 'ルギアV SRC', 'リスト項目はルギアVのまま維持')
  assert.equal(enriched[0].productId, undefined, 'ガルーラの商品IDが混入しない')
  // 人が判断できるよう「⚠名前が変わったかも」候補には出す
  const sus = detectRenamedCards(items, today)
  assert.equal(sus.length, 1, '候補提示には出す（人が確定）')
  assert.equal(sus[0].candidate.id, 'g1')
})
test('事故再現: レアリティまで同じ別カードも置換しない（ピカゼク→アカネ 101/095 SRC）', () => {
  const items = [{ listNo: '101/095', type: 'PSA10', name: 'ピカチュウ&ゼクロムGX SRC' }]
  const today = [{ id: 'a1', productId: 'a1', listNo: '101/095', type: 'PSA10', name: 'アカネ', expansion: 'SM8', rarity: 'SRC', basePrice: 10000 }]
  assert.equal(applyList(items, today).length, 0, 'アカネに化けない')
  assert.equal(enrichItems(items, today)[0].name, 'ピカチュウ&ゼクロムGX SRC')
})
test('親和性があれば従来どおり自動引継（名称分離・表記ゆれは救済を維持）', () => {
  // 新素名⊂旧保存名（variant分離）
  const r1 = applyList(
    [{ listNo: '079/XY-P', type: 'PSA10', name: 'MゲンガーEX(HOLLOW GEIST)' }],
    [{ id: 'c1', listNo: '079/XY-P', type: 'PSA10', name: 'MゲンガーEX', rarity: 'PROMO' }]
  )
  assert.equal(r1.length, 1, 'variant分離は自動引継')
  // 旧保存名⊂新名（逆方向の包含）
  const r2 = applyList(
    [{ listNo: '028/071', type: 'PSA10', name: 'ピカチュウ R' }],
    [{ id: 'c2', listNo: '028/071', type: 'PSA10', name: 'ピカチュウ R(ポケモンGO)' }]
  )
  assert.equal(r2.length, 1, '包含は双方向OK')
  // 類似度が高い表記ゆれ（バイグラム0.5以上）
  const r3 = applyList(
    [{ listNo: 'JP034', type: 'PSA10', name: 'IPマスカレーナ' }],
    [{ id: 'c3', listNo: 'JP034', type: 'PSA10', name: 'I:Pマスカレーナ', rarity: 'プリズマティックシークレット' }]
  )
  assert.equal(r3.length, 1, '表記ゆれは類似度で救済')
})
test('汚染済み項目（商品IDが別カードを指す）は商品ID優先で解決される＝手動修復後は名前が正', () => {
  // 手動修復でname/productIdを正しく直した項目は、以後productIdで不動
  const items = [{ listNo: '110/098', type: 'PSA10', name: 'ルギアV', productId: 'lugia-1' }]
  const today = [
    { id: 'g1', productId: 'g1', listNo: '110/098', type: 'PSA10', name: 'ガルーラ' },
    { id: 'lugia-1', productId: 'lugia-1', listNo: '110/098', type: 'PSA10', name: 'ルギアV' },
  ]
  const r = applyList(items, today)
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'lugia-1', '商品IDで正しいカードに解決')
})
