// 最小CSVパーサー（クォート・カンマ・改行・エスケープ対応）
// GoogleスプシのCSVエクスポートを2次元配列にする。

/**
 * @param {string} text CSV文字列
 * @returns {string[][]} 行×列の2次元配列
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  const s = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]

    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') { inQuotes = true; continue }
    if (ch === ',') { row.push(field); field = ''; continue }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }
  // 末尾フィールド/行
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}
