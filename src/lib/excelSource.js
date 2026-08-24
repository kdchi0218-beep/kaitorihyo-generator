// Excelアップロード → 1ファイルから最大6ジャンルを一括パース
// 毎日シート(ファイル)が変わる運用に対応：その日のExcelを1回上げれば全ジャンル読める。

import { GENRES, GENRE_BY_KEY, detectFormat } from './genres.js'
import { parseVaultRows } from './vaultParser.js'

// 約500KBあるExcel処理は、ファイル読込時だけ遅延ロードして初期表示を軽くする。
const loadXlsx = () => import('xlsx')

/**
 * ジャンルに対応するシート名を探す。
 * 完全一致 → 部分一致（sheetHint）→ 別名(sheetHintsExtra)の順。
 * 新形式のシート名変更（例「ポケモン(旧裏・カードe)」）も別名で拾える。
 * @returns {string|undefined}
 */
export function findSheetName(sheetNames, g) {
  const hints = [g.sheetHint, ...(g.sheetHintsExtra || [])].filter(Boolean)
  for (const h of hints) {                          // まず全ヒントで完全一致を優先
    const exact = sheetNames.find(n => n === h)
    if (exact) return exact
  }
  for (const h of hints) {                          // 次に部分一致
    const inc = sheetNames.find(n => n.includes(h))
    if (inc) return inc
  }
  return undefined
}

/**
 * @param {File} file Excelファイル
 * @returns {Promise<Record<string,{cards:object[],total:number,withPrice:number,withImage:number,notFound?:boolean}>>}
 */
export async function parseExcelAllGenres(file) {
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const out = {}
  let matchedSheetCount = 0
  let parsedSheetCount = 0
  const parseErrors = []

  for (const g of GENRES) {
    // シート名を sheetHint / sheetHintsExtra で検索（完全一致 → 部分一致）
    const name = findSheetName(wb.SheetNames, g)

    if (!name) {
      out[g.key] = { cards: [], total: 0, withPrice: 0, withImage: 0, notFound: true }
      continue
    }
    matchedSheetCount += 1

    const ws = wb.Sheets[name]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
    const rows = raw.map(r => (Array.isArray(r) ? r : []).map(c => (c == null ? '' : String(c))))
    const format = detectFormat(rows[0])   // 'new' | 'old' | 'unknown'（UI表示用）
    try {
      out[g.key] = { ...parseVaultRows(rows, g.key), format }
      parsedSheetCount += 1
    } catch (e) {
      out[g.key] = { cards: [], total: 0, withPrice: 0, withImage: 0, error: e.message, format }
      parseErrors.push(e.message)
    }
  }

  // xlsxライブラリは単なるテキストでもSheet1のワークブックとして読める。
  // その状態を全対応ジャンル0件の正常取込と扱うと既存データを消すため、
  // 対応シートが無い、または対応シートを1枚も解析できない場合は取込失敗にする。
  if (matchedSheetCount === 0) {
    throw new Error('パワン形式の対応ジャンルシートが見つかりません')
  }
  if (parsedSheetCount === 0) {
    const detail = parseErrors[0] ? `: ${parseErrors[0]}` : ''
    throw new Error(`パワン形式のシートを解析できません${detail}`)
  }
  return out
}

/**
 * Excel から「1ジャンルだけ」読み込む。
 * 指定ジャンルのシートがあればそれを、無ければファイル先頭シートを使う（単一シートExcel対応）。
 * @param {File} file
 * @param {string} genreKey
 */
export async function parseExcelSingleGenre(file, genreKey) {
  const g = GENRE_BY_KEY[genreKey]
  if (!g) throw new Error(`未知のジャンル: ${genreKey}`)
  const XLSX = await loadXlsx()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })

  // 該当ジャンルのシート → 無ければ先頭シート（1シートだけのファイル想定）
  let name = findSheetName(wb.SheetNames, g)
  let usedFirstSheet = false
  if (!name) { name = wb.SheetNames[0]; usedFirstSheet = true }
  if (!name) throw new Error('シートが見つかりません')

  const ws = wb.Sheets[name]
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' })
  const rows = raw.map(r => (Array.isArray(r) ? r : []).map(c => (c == null ? '' : String(c))))
  const result = parseVaultRows(rows, genreKey)
  return { ...result, sheetName: name, usedFirstSheet }
}
