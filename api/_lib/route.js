import { UpstreamError } from './cardrush-service.js'

export function allowMethod(req, res, method) {
  if (req.method === method) return true
  res.setHeader('Allow', method)
  res.status(405).json({ error: `${method} only` })
  return false
}

export function sendRouteError(res, error) {
  const message = error?.message || 'unknown error'
  if (error instanceof UpstreamError) {
    res.status(error.statusCode || 502).json({ error: message })
    return
  }
  if (/required|invalid|must be|too long|at most/i.test(message)) {
    res.status(400).json({ error: message })
    return
  }
  console.error('CardRush API error:', message)
  res.status(500).json({ error: 'server error' })
}
