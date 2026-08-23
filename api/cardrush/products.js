import { normalizeGenre, normalizeProductIds } from '../_lib/cardrush-config.js'
import { getProduct } from '../_lib/cardrush-service.js'
import { allowMethod, sendRouteError } from '../_lib/route.js'
import { requireScraperAuthorization } from '../_lib/scraper-auth.js'

export const maxDuration = 300

export function parseProductsBody(body) {
  let parsed = body
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body) } catch { throw new Error('invalid JSON body') }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('invalid request body')
  }
  return parsed
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const output = new Array(values.length)
  let cursor = 0
  async function worker() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      output[index] = await mapper(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker))
  return output
}

export default async function handler(req, res) {
  if (!allowMethod(req, res, 'POST') || !requireScraperAuthorization(req, res)) return
  try {
    const body = parseProductsBody(req.body)
    const genre = normalizeGenre(body.genre)
    const ids = normalizeProductIds(body.ids)
    const rows = await mapWithConcurrency(ids, 3, async (id) => [id, await getProduct({ genre, id })])
    const results = Object.fromEntries(rows)
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).json({ count: rows.length, results })
  } catch (error) {
    sendRouteError(res, error)
  }
}
