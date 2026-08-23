import {
  buildBuyingPricesUrl,
  buildCdnImageUrl,
  buildProductUrl,
  buildSearchBoxUrl,
  CARD_RUSH_HEADERS,
  isAllowedCardRushUrl,
  normalizeGenre,
  normalizeProductId,
} from './cardrush-config.js'
import {
  extractNextData,
  extractProductFromHtml,
  extractSearchResultsFromHtml,
} from './cardrush-parsers.js'
import { loadHtmlWithBrowser } from './browser.js'
import { makeScrapeCacheKey, scrapeCache } from './scrape-cache.js'

const PRICES_TTL_SECONDS = 60 * 60
const PRODUCT_TTL_SECONDS = 60 * 60
const SEARCH_TTL_SECONDS = 6 * 60 * 60

export class UpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'UpstreamError'
    this.statusCode = statusCode
  }
}

async function fetchHtml(url, timeoutMs = 30_000) {
  let response
  try {
    response = await fetch(url, {
      headers: CARD_RUSH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    throw new UpstreamError(error?.name === 'TimeoutError' ? 'CardRush timeout' : 'CardRush request failed', 504)
  }
  if (!response.ok) throw new UpstreamError(`CardRush returned ${response.status}`)
  if (!isAllowedCardRushUrl(response.url || url)) throw new UpstreamError('CardRush redirected to an untrusted host')
  return response.text()
}

async function imageExists(url) {
  if (!isAllowedCardRushUrl(url)) return false
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: CARD_RUSH_HEADERS,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    return response.ok
  } catch {
    return false
  }
}

function trustedImage(value) {
  return isAllowedCardRushUrl(value) ? value : ''
}

export async function getBuyingPrices({ genre, name, modelNumber, rarity }) {
  const safeGenre = normalizeGenre(genre)
  const url = buildBuyingPricesUrl({ genre: safeGenre, name, modelNumber, rarity })
  const key = makeScrapeCacheKey(['prices', safeGenre, name, modelNumber || '', rarity || ''])
  const cached = await scrapeCache.get('cardrush_prices', key)
  if (cached) return cached

  const data = extractNextData(await fetchHtml(url))
  await scrapeCache.set('cardrush_prices', key, data, PRICES_TTL_SECONDS)
  return data
}

async function fetchProductHtml(productUrl) {
  let directHtml = ''
  try {
    directHtml = await fetchHtml(productUrl)
  } catch {
    // Cloudflare等で直接取得できない場合はブラウザへフォールバックする。
  }
  const direct = directHtml ? extractProductFromHtml(directHtml, productUrl) : null
  if (direct?.sellingPrice != null) return direct

  let browserPage
  try {
    browserPage = await loadHtmlWithBrowser(productUrl)
  } catch (error) {
    if (direct) return direct
    console.error('CardRush product browser failed:', error?.name || 'Error', error?.message || 'unknown')
    if (/CHROMIUM_PACK_URL/.test(error?.message || '')) {
      throw new UpstreamError('browser runtime is not configured', 503)
    }
    throw new UpstreamError('CardRush browser request failed', 502)
  }
  if (!isAllowedCardRushUrl(browserPage.finalUrl)) throw new UpstreamError('CardRush redirected to an untrusted host')
  return extractProductFromHtml(browserPage.html, productUrl)
}

export async function getProduct({ genre, id }) {
  const safeGenre = normalizeGenre(genre)
  const safeId = normalizeProductId(id)
  const key = makeScrapeCacheKey(['product', safeGenre, safeId])
  const cached = await scrapeCache.get('cardrush_product', key)
  if (cached) return cached

  const productUrl = buildProductUrl(safeGenre, safeId)
  const parsed = await fetchProductHtml(productUrl)
  const cdnImageUrl = buildCdnImageUrl(safeGenre, safeId)
  const parsedImage = trustedImage(parsed.imageUrl)
  const useCdn = await imageExists(cdnImageUrl)
  const imageUrl = useCdn ? cdnImageUrl : parsedImage
  const result = {
    id: Number(safeId),
    name: parsed.name,
    imageUrl,
    imageExists: Boolean(imageUrl),
    sellingPrice: parsed.sellingPrice,
    productPageUrl: productUrl,
  }

  if (result.sellingPrice != null) {
    await scrapeCache.set('cardrush_product', key, result, PRODUCT_TTL_SECONDS)
  }
  return result
}

export async function searchBox({ genre, name }) {
  const safeGenre = normalizeGenre(genre)
  const searchUrl = buildSearchBoxUrl(safeGenre, name)
  const key = makeScrapeCacheKey(['search_box', safeGenre, name])
  const cached = await scrapeCache.get('cardrush_search', key)
  if (cached) return cached

  let html = ''
  try {
    html = await fetchHtml(searchUrl)
  } catch {
    // 直接取得できない場合はブラウザへフォールバックする。
  }
  let results = html ? extractSearchResultsFromHtml(html, searchUrl) : []
  if (results.length === 0) {
    let browserPage
    try {
      browserPage = await loadHtmlWithBrowser(searchUrl)
    } catch (error) {
      console.error('CardRush search browser failed:', error?.name || 'Error', error?.message || 'unknown')
      if (/CHROMIUM_PACK_URL/.test(error?.message || '')) {
        throw new UpstreamError('browser runtime is not configured', 503)
      }
      throw new UpstreamError('CardRush browser request failed', 502)
    }
    if (!isAllowedCardRushUrl(browserPage.finalUrl)) throw new UpstreamError('CardRush redirected to an untrusted host')
    results = extractSearchResultsFromHtml(browserPage.html, searchUrl)
  }

  const result = {
    results: results
      .filter((item) => isAllowedCardRushUrl(item.productUrl))
      .map((item) => ({ ...item, imageUrl: trustedImage(item.imageUrl) })),
    searchUrl,
  }
  await scrapeCache.set('cardrush_search', key, result, SEARCH_TTL_SECONDS)
  return result
}
