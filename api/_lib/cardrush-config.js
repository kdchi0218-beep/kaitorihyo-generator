const GENRE_CONFIG = Object.freeze({
  pokemon: Object.freeze({
    mediaGenre: 'pokemon',
    ecHost: 'www.cardrush-pokemon.jp',
    ecDataPath: 'cardrushpokemon',
  }),
  onepiece: Object.freeze({
    mediaGenre: 'onepiece',
    ecHost: 'www.cardrush-op.jp',
    ecDataPath: 'cardrush-op',
  }),
})

const ALLOWED_CARD_RUSH_HOSTS = new Set([
  'cardrush.media',
  'files.cardrush.media',
  'www.cardrush-pokemon.jp',
  'www.cardrush-op.jp',
])

export const CARD_RUSH_HEADERS = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
})

export function normalizeGenre(value) {
  const genre = String(value || 'pokemon').trim().toLowerCase()
  if (!Object.hasOwn(GENRE_CONFIG, genre)) {
    throw new Error('genre must be pokemon or onepiece')
  }
  return genre
}

export function getGenreConfig(value) {
  return GENRE_CONFIG[normalizeGenre(value)]
}

function normalizeText(value, fieldName, maxLength = 200) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${fieldName} required`)
  if (text.length > maxLength) throw new Error(`${fieldName} too long`)
  return text
}

export function normalizeProductId(value) {
  const id = String(value ?? '').trim()
  if (!/^\d{1,12}$/.test(id)) throw new Error('invalid product id')
  return id
}

export function normalizeProductIds(values, maxItems = 25) {
  if (!Array.isArray(values) || values.length === 0) throw new Error('ids array required')
  if (values.length > maxItems) throw new Error(`ids must contain at most ${maxItems} items`)
  return [...new Set(values.map(normalizeProductId))]
}

export function buildBuyingPricesUrl({ genre, name, modelNumber, rarity }) {
  const safeGenre = normalizeGenre(genre)
  const url = new URL(`https://cardrush.media/${safeGenre}/buying_prices`)
  url.searchParams.set('name', normalizeText(name, 'name'))
  url.searchParams.set('limit', '50')
  url.searchParams.set('page', '1')
  url.searchParams.set('sort[key]', 'amount')
  url.searchParams.set('sort[order]', 'desc')
  if (modelNumber != null && String(modelNumber).trim()) {
    url.searchParams.set('model_number', normalizeText(modelNumber, 'model_number', 100))
  }
  if (rarity != null && String(rarity).trim()) {
    url.searchParams.set('rarity', normalizeText(rarity, 'rarity', 100))
  }
  return url.toString()
}

export function buildProductUrl(genre, id) {
  const config = getGenreConfig(genre)
  return `https://${config.ecHost}/product/${normalizeProductId(id)}`
}

export function buildSearchBoxUrl(genre, name) {
  const config = getGenreConfig(genre)
  const url = new URL(`https://${config.ecHost}/product-list`)
  url.searchParams.set('keyword', `${normalizeText(name, 'name')} box`)
  return url.toString()
}

export function buildCdnImageUrl(genre, id) {
  const config = getGenreConfig(genre)
  return `https://files.cardrush.media/${config.mediaGenre}/ocha_products/${normalizeProductId(id)}.webp`
}

export function isAllowedCardRushUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ALLOWED_CARD_RUSH_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}
