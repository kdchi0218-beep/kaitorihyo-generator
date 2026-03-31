import * as XLSX from 'xlsx'

/**
 * Excelを読み込み、アカウントのフォーマットに応じてカード一覧を返す
 * - carddesk: 「ポケモン」+「買取表価格サマリ」の2シート構成
 * - tonton: 1シートに全データ（カードタイプ,カラー,ボックス名,カード番号,カード名,レアリティ,種別,買取価格,画像URL）
 */
export function parseExcel(file, format) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })

        if (format === 'tonton') {
          resolve(parseTontonFormat(workbook))
        } else {
          resolve(parseCardDeskFormat(workbook))
        }
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('ファイル読み込みエラー'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * トントンフォーマット解析（ポケモン/ワンピース両対応）
 * ヘッダー行から列位置を自動検出
 * ワンピース(9列): カードタイプ, カラー, ボックス名, カード番号, カード名, レアリティ, 種別, 買取価格, カード画像URL
 * ポケモン(8列):   ジャンル, ボックス名, カード番号, カード名, レアリティ, 種別, 買取価格, カード画像URL
 */
function parseTontonFormat(workbook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

  if (rows.length === 0) return { cards: [], masterCount: 0, imageCount: 0, matchedImages: 0, hasMaster: false, format: 'tonton', gameType: 'pokemon' }

  // ヘッダーから列インデックスを自動検出
  const header = rows[0].map(h => String(h || '').trim())
  const col = {
    category: header.findIndex(h => h === 'カードタイプ' || h === 'ジャンル'),
    boxName:  header.findIndex(h => h === 'ボックス名'),
    cardNo:   header.findIndex(h => h === 'カード番号'),
    cardName: header.findIndex(h => h === 'カード名'),
    rarity:   header.findIndex(h => h === 'レアリティ'),
    type:     header.findIndex(h => h === '種別'),
    price:    header.findIndex(h => h === '買取価格'),
    imageUrl: header.findIndex(h => h === 'カード画像URL'),
  }

  // カード名列が見つからなければエラー
  if (col.cardName === -1) {
    throw new Error('ヘッダーに「カード名」列が見つかりません')
  }

  const cards = []
  let matchedImages = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const cardName = col.cardName >= 0 ? String(row[col.cardName] || '') : ''
    if (!cardName) continue

    const cardNo = col.cardNo >= 0 && row[col.cardNo] ? String(row[col.cardNo]) : ''
    const rawPrice = col.price >= 0 ? row[col.price] : 0
    const price = typeof rawPrice === 'number' ? rawPrice : parsePrice(rawPrice)
    const imgVal = col.imageUrl >= 0 ? row[col.imageUrl] : null
    const imageUrl = (imgVal && String(imgVal).startsWith('http')) ? String(imgVal) : null
    const category = col.category >= 0 ? String(row[col.category] || '') : ''
    const type = col.type >= 0 ? String(row[col.type] || '') : ''
    const rarity = col.rarity >= 0 ? String(row[col.rarity] || '') : ''
    const boxName = col.boxName >= 0 ? String(row[col.boxName] || '') : ''

    if (imageUrl) matchedImages++

    cards.push({
      id: cardNo || `card_${i}`,
      name: cardName,
      listNo: cardNo,
      price,
      category,
      type,
      tag: `${boxName} ${rarity}`.trim() || category,
      imageUrl,
      selected: false,
      boxName,
      rarity,
    })
  }

  // ゲーム種別を自動判定（シート名・カード番号のプレフィックスから）
  const sheetName = workbook.SheetNames[0] || ''
  const isOnepiece = sheetName.includes('ワンピース') ||
    cards.some(c => /^(OP|ST|EB)\d/.test(c.listNo))
  const gameType = isOnepiece ? 'onepiece' : 'pokemon'

  return {
    cards,
    masterCount: cards.length,
    imageCount: matchedImages,
    matchedImages,
    hasMaster: true,
    format: 'tonton',
    gameType,
  }
}

/**
 * CardDeskフォーマット解析（既存）
 * 「ポケモン」シート（画像マスター）+ 「買取表価格サマリ」シート
 */
function parseCardDeskFormat(workbook) {
  // --- Step 1: ポケモンシートから画像URLマップを構築 ---
  const imageByNameAndNo = new Map()
  const imageByName = new Map()
  const imageByListNo = new Map()
  let masterCount = 0

  const pokemonSheetName = workbook.SheetNames.find(n => n === 'ポケモン')

  if (pokemonSheetName) {
    const sheet = workbook.Sheets[pokemonSheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row[0]) continue
      masterCount++

      if (row[3] && String(row[3]).startsWith('http')) {
        const name = String(row[0])
        const listNo = row[2] ? String(row[2]) : ''
        const url = String(row[3])

        imageByNameAndNo.set(`${name}_${listNo}`, url)
        if (!imageByName.has(name)) imageByName.set(name, url)
        if (listNo && !imageByListNo.has(listNo)) imageByListNo.set(listNo, url)
      }
    }
  }

  // --- Step 2: 買取表価格サマリからカード一覧を作成 ---
  const summarySheetName = workbook.SheetNames.find(n =>
    n.includes('買取表価格サマリ') || n.includes('買取表サマリ')
  )
  if (!summarySheetName) {
    throw new Error('「買取表価格サマリ」シートが見つかりません。\nトントンフォーマットの場合はヘッダー行を確認してください。')
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

  // ゲーム種別: 「ポケモン」シートがあればポケモン、なければカード番号で判定
  const isOnepiece = !pokemonSheetName &&
    cards.some(c => /^(OP|ST|EB)\d/.test(c.listNo))
  const gameType = isOnepiece ? 'onepiece' : 'pokemon'

  return {
    cards,
    masterCount,
    imageCount: imageByNameAndNo.size,
    matchedImages,
    hasMaster: !!pokemonSheetName,
    format: 'carddesk',
    gameType,
  }
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
