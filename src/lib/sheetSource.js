// Googleスプレッドシートの「タブURL」からカードデータを取得する層。
// 店舗が各ジャンルタブのURL（#gid=付き）を貼る → CSVエクスポートを取得 → パース。
//
// CORS回避のためサーバー関数 /api/sheet 経由で取得する。
// （docs.google.com のCSVエクスポートはブラウザ直fetchだとCORSで弾かれることがあるため）

import { parseCsv } from './csv.js'
import { parseVaultRows } from './vaultParser.js'

/**
 * タブURLから spreadsheetId と gid を抽出。
 * 例: https://docs.google.com/spreadsheets/d/<ID>/edit#gid=123456
 */
export function parseSheetUrl(url) {
  const u = String(url || '').trim()
  const idMatch = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) throw new Error('GoogleスプレッドシートのURLではありません')
  const id = idMatch[1]

  let gid = '0'
  const gidMatch = u.match(/[#&?]gid=([0-9]+)/)
  if (gidMatch) gid = gidMatch[1]

  return { id, gid }
}

/** CSVエクスポートURL（gviz: リンク共有/公開どちらでもCSVを返す） */
export function buildCsvUrl({ id, gid }) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`
}

/**
 * タブURL + ジャンル → カードデータ取得。
 * @param {string} url GoogleスプシのタブURL
 * @param {string} genreKey
 * @param {(csvUrl:string)=>Promise<string>} [fetchCsv] CSV取得関数（テスト差し替え用）
 */
export async function fetchGenreFromSheet(url, genreKey, fetchCsv = defaultFetchCsv) {
  const { id, gid } = parseSheetUrl(url)
  const csvUrl = buildCsvUrl({ id, gid })
  const text = await fetchCsv(csvUrl)
  const rows = parseCsv(text)
  return parseVaultRows(rows, genreKey)
}

async function defaultFetchCsv(csvUrl) {
  // サーバー関数プロキシ経由（本番=Vercel Function / ローカル=vite proxy）
  const res = await fetch(`/api/sheet?u=${encodeURIComponent(csvUrl)}`)
  if (!res.ok) {
    const msg = await res.text().catch(() => '')
    throw new Error(`スプシ取得失敗 (${res.status}) ${msg}`.trim())
  }
  return res.text()
}
