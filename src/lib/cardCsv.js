// 現在プレビュー中の買取表を Excel で開ける CSV に変換する。
export function cardsToCsv(cards) {
  const escape = (value) => {
    const text = String(value ?? '')
    // Excel が数式として評価する先頭記号・制御文字を文字列扱いに固定する。
    const safe = (/^\s*[=+\-@]/.test(text) || /^\s*[\t\r\n]/.test(text)) ? `'${text}` : text
    return `"${safe.replace(/"/g, '""')}"`
  }
  const rows = [[
    'No', 'カード名', '型番', '種別', 'レアリティ', '買取価格', '発注状況', '前回価格',
  ]]

  ;(cards || []).forEach((card, index) => {
    rows.push([
      index + 1,
      card.name,
      card.listNo,
      card.type,
      card.rarity,
      card.priceText ?? card.price ?? '',
      card.missing ? '発注なし' : '発注あり',
      card.priceIsLast ? '○' : '',
    ])
  })

  return `\uFEFF${rows.map(row => row.map(escape).join(',')).join('\r\n')}`
}
