import { searchBox } from '../_lib/cardrush-service.js'
import { allowMethod, sendRouteError } from '../_lib/route.js'
import { requireScraperAuthorization } from '../_lib/scraper-auth.js'

export const maxDuration = 300

export default async function handler(req, res) {
  if (!allowMethod(req, res, 'GET') || !requireScraperAuthorization(req, res)) return
  try {
    const data = await searchBox({ genre: req.query?.genre, name: req.query?.name })
    res.setHeader('Cache-Control', 'private, no-store')
    res.status(200).json(data)
  } catch (error) {
    sendRouteError(res, error)
  }
}
