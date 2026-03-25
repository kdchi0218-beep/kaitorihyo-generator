import * as XLSX from 'xlsx'

/**
 * 1つのExcelから「ポケモン」シート（画像マスター）と「買取表価格サマリ」シートを
 * 同時に読み込み、画像URLと買取価格を結合したカード一覧を返す
 */
export function parseExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        // --- Step 1: ポケモンシートから画像URLマップを構築 ---
        // 3種類のキーで検索できるようにする
        const imageByNameAndNo = new Map()  // "カード名_list_no" → URL
        const imageByName = new Map()       // "カード名" → URL（最初のヒットのみ）
        const imageByListNo = new Map()     // "list_no" → URL（最初のヒットのみ）
        let masterCount = 0

        const pokemonSheetName = workbook.SheetNames.find(n => n === 'ポケモン')

        if (pokemonSheetName) {
          const sheet = workbook.Sheets[pokemonSheetName]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

          // A: カード名, B: 種別, C: list_no, D: 画像URL
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row[0]) continue
            masterCount++

            if (row[3] && String(row[3]).startsWith('http')) {
              const name = String(row[0])
              const listNo = row[2] ? String(row[2]) : ''
              const url = String(row[3])

              // カード名+list_no（最も正確）
              imageByNameAndNo.set(`${name}_${listNo}`, url)
              // カード名のみ（フォールバック）
              if (!imageByName.has(name)) imageByName.set(name, url)
              // list_noのみ（最終フォールバック）
              if (listNo && !imageByListNo.has(listNo)) imageByListNo.set(listNo, url)
            }
          }
        }

        // --- Step 2: 買取表価格サマリからカード一覧を作成 ---
        const summarySheetName = workbook.SheetNames.find(n =>
          n.includes('買取表価格サマリ') || n.includes('買取表サマリ')
        )
        if (!summarySheetName) {
          reject(new Error('「買取表価格サマリ」シートが見つかりません'))
          return
        }

        const summarySheet = workbook.Sheets[summarySheetName]
        const summaryRows = XLSX.utils.sheet_to_json(summarySheet, { header: 1 })

        const cards = []
        let matchedImages = 0

        for (let i = 2; i < summaryRows.length; i++) {
          const row = summaryRows[i]
          if (!row[0] || !row[3]) continue

          const cardName = String(row[3])
          const listNo = row[4] ? String(row[4]) : ''
          const price = typeof row[5] === 'number' ? row[5] : parsePrice(row[5])
          const category = String(row[0])
          const type = String(row[1] || '')
          const tag = row[6] ? String(row[6]) : `${category}${type}`

          // 画像検索: 名前+番号 → 名前のみ → 番号のみ の優先度
          const imageUrl =
            imageByNameAndNo.get(`${cardName}_${listNo}`) ||
            imageByName.get(cardName) ||
            imageByListNo.get(listNo) ||
            null

          if (imageUrl) matchedImages++

          cards.push({
            id: row[2] || `card_${i}`,
            name: cardName,
            listNo,
            price,
            category,
            type,
            tag,
            imageUrl,
            selected: false,
          })
        }

        const totalImages = imageByNameAndNo.size + imageByName.size + imageByListNo.size

        resolve({
          cards,
          masterCount,
          imageCount: imageByNameAndNo.size,
          matchedImages,
          hasMaster: !!pokemonSheetName,
        })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'))
    reader.readAsArrayBuffer(file)
  })
}

function parsePrice(val) {
  if (val == null) return 0
  const str = String(val).replace(/[¥￥,、]/g, '').trim()
  const num = Number(str)
  return isNaN(num) ? 0 : num
}

export function formatPrice(price, settings) {
  if (price == null || price === 0) return settings.priceNullText || '-'
  const prefix = settings.pricePrefix || ''
  const yen = settings.priceShowYen ? '¥' : ''
  if (settings.priceFormat === 'comma') {
    return `${prefix}${yen}${price.toLocaleString()}`
  }
  return `${prefix}${yen}${price}`
}
