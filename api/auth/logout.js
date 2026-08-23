import { logoutBoundBrowser } from '../_lib/browser-session.js'
import { enforceSameOriginJson } from '../_lib/request-security.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return }
  if (!enforceSameOriginJson(req, res)) return
  // Device registration is intentionally retained: a later login on this browser remains valid.
  await logoutBoundBrowser(req, res)
  res.status(204).end()
}
