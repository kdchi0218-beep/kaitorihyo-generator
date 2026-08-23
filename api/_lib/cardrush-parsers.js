function decodeHtml(value = '') {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function plainText(value = '') {
  return decodeHtml(String(value).replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function attribute(tag, name) {
  const match = String(tag).match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))
  return match ? decodeHtml(match[2]).trim() : ''
}

export function extractNextData(html) {
  const match = String(html).match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)
  if (!match) throw new Error('NEXT_DATA not found')
  return JSON.parse(match[1])
}

function extractPrice(text) {
  const patterns = [
    /販売価格[^0-9]*?([0-9,]+)\s*円/i,
    /税込[^0-9]*?([0-9,]+)\s*円/i,
    /¥\s*([0-9,]+)/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match) continue
    const value = Number.parseInt(match[1].replace(/,/g, ''), 10)
    if (Number.isFinite(value) && value > 0) return value
  }
  return null
}

function resolveUrl(value, baseUrl) {
  if (!value) return ''
  try {
    return new URL(value, baseUrl).toString()
  } catch {
    return ''
  }
}

export function extractProductFromHtml(html, productUrl) {
  const source = String(html)
  const titleMatch = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  const name = plainText(titleMatch?.[1] || '').replace(/\s*-\s*カードラッシュ.*$/i, '').trim()
  const bodyText = plainText(source)

  let imageUrl = ''
  for (const match of source.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0]
    const src = attribute(tag, 'src') || attribute(tag, 'data-src')
    const alt = attribute(tag, 'alt')
    if (/\/data\/cardrush[^/]*\/product\//i.test(src) || /^画像1:/i.test(alt)) {
      imageUrl = resolveUrl(src, productUrl)
      if (imageUrl) break
    }
  }

  return {
    name,
    sellingPrice: extractPrice(bodyText),
    imageUrl,
  }
}

export function extractSearchResultsFromHtml(html, searchUrl) {
  const source = String(html)
  const byId = new Map()
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi

  for (const match of source.matchAll(anchorPattern)) {
    const openTag = `<a${match[1]}>`
    const href = attribute(openTag, 'href')
    const idMatch = href.match(/\/product\/(\d{1,12})(?:[/?#]|$)/)
    if (!idMatch) continue

    const productName = plainText(match[2])
    if (!/(?:BOX|未開封|ボックス)/i.test(productName)) continue

    const imageTag = match[2].match(/<img\b[^>]*>/i)?.[0] || ''
    const imageUrl = resolveUrl(attribute(imageTag, 'src') || attribute(imageTag, 'data-src'), searchUrl)
    const productUrl = resolveUrl(href, searchUrl)
    if (!productUrl || byId.has(idMatch[1])) continue

    byId.set(idMatch[1], {
      productId: idMatch[1],
      productName,
      imageUrl,
      productUrl,
    })
  }

  return [...byId.values()]
}
