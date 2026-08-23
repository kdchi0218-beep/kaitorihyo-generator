// Excelライブラリは取込時だけ読み込み、アプリの初期バンドルへ含めない。
const loadXlsx = () => import('xlsx')

const HEADER_ALIASES = {
  productId: ['商品ID', '商品id', 'product_id'],
  category: ['カードタイプ', 'ジャンル'],
  boxName: ['ボックス名', '弾', 'エキスパンション'],
  cardNo: ['カード番号', 'list_no', 'リスト番号'],
  cardName: ['カード名', '名称', '商品名'],
  rarity: ['レアリティ', 'rarity'],
  type: ['種別'],
  price: ['買取価格', '納品希望価格', '納品希望価格（税込）', '納品希望価格(税込)', '希望価格'],
  imageUrl: ['カード画像URL', '画像URL', '画像'],
}

function buildColumnMap(header) {
  const normalized = (header || []).map(value => String(value || '').trim())
  const columns = {}

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    columns[field] = normalized.findIndex(value => aliases.includes(value))
  }

  return columns
}

function cell(row, index) {
  if (index == null || index < 0) return ''
  const value = row[index]
  return value == null ? '' : String(value).trim()
}

function toNumber(value) {
  const normalized = String(value ?? '').replace(/[¥￥,、\s]/g, '').trim()
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function makeUniqueId(baseId, seenIds) {
  if (!seenIds.has(baseId)) {
    seenIds.add(baseId)
    return baseId
  }

  let suffix = 2
  while (seenIds.has(`${baseId}__${suffix}`)) suffix += 1
  const uniqueId = `${baseId}__${suffix}`
  seenIds.add(uniqueId)
  return uniqueId
}

export function detectTontonGenre(rows, sheetName = '') {
  if (String(sheetName).includes('ワンピース')) return 'onepiece'
  if (String(sheetName).includes('ポケモン')) return 'pokemon'

  const columns = buildColumnMap(rows?.[0])
  for (const row of (rows || []).slice(1)) {
    const category = cell(row, columns.category)
    const cardNo = cell(row, columns.cardNo)
    if (category.includes('ワンピース') || /^(OP|ST|EB)\d/i.test(cardNo)) return 'onepiece'
    if (category.includes('ポケモン')) return 'pokemon'
  }

  // 旧とんとん版も判定不能時はポケモン扱いだったため後方互換を維持する。
  return 'pokemon'
}

/**
 * とんとんの単一シート形式を、Vault版が利用する共通カードモデルへ変換する。
 */
export function parseTontonRows(rows, { sheetName = '' } = {}) {
  if (!rows || rows.length === 0) {
    return { genreKey: 'pokemon', cards: [], total: 0, withPrice: 0, withImage: 0 }
  }

  const columns = buildColumnMap(rows[0])
  if (columns.cardName < 0) {
    throw new Error('ヘッダーに「カード名」列が見つかりません')
  }

  const genreKey = detectTontonGenre(rows, sheetName)
  const seenIds = new Set()
  const cards = []
  let withPrice = 0
  let withImage = 0

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]
    const name = cell(row, columns.cardName)
    if (!name) continue

    const productId = cell(row, columns.productId)
    const listNo = cell(row, columns.cardNo)
    const type = cell(row, columns.type)
    const expansion = cell(row, columns.boxName)
    const rarity = cell(row, columns.rarity)
    const rawImageUrl = cell(row, columns.imageUrl)
    const imageUrl = /^https?:\/\//i.test(rawImageUrl) ? rawImageUrl : null
    const basePrice = toNumber(cell(row, columns.price))
    const baseId = productId || `tonton_${genreKey}_${listNo || 'card'}_${rowIndex}`

    if (basePrice > 0) withPrice += 1
    if (imageUrl) withImage += 1

    cards.push({
      id: makeUniqueId(baseId, seenIds),
      productId,
      genre: genreKey,
      gameType: genreKey,
      name,
      listNo,
      type,
      expansion,
      rarity,
      imageUrl,
      reqCount: 0,
      basePrice,
      tag: [expansion, rarity, type].filter(Boolean).join(' '),
      selected: false,
      sourceType: 'tonton',
    })
  }

  return { genreKey, cards, total: cards.length, withPrice, withImage }
}

export async function parseTontonExcel(file) {
  const XLSX = await loadXlsx()
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('Excelにシートが見つかりません')

  const sheet = workbook.Sheets[sheetName]
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
  const rows = rawRows.map(row => (Array.isArray(row) ? row : []))
  const result = parseTontonRows(rows, { sheetName })

  return {
    [result.genreKey]: {
      ...result,
      format: 'tonton',
      sheetName,
    },
  }
}
