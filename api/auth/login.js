import { BrowserSessionError, loginBoundBrowser } from '../_lib/browser-session.js'
import { enforceSameOriginJson } from '../_lib/request-security.js'

function credentials(body) {
  const email = String(body?.email || '').trim().toLowerCase()
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length === 0 || password.length > 256) {
    throw new BrowserSessionError(400, 'INVALID_LOGIN_REQUEST')
  }
  return { email, password }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return }
  if (!enforceSameOriginJson(req, res)) return
  try {
    const result = await loginBoundBrowser(req, res, credentials(req.body))
    // Tokens and device secrets are only emitted as HttpOnly cookies.
    res.status(200).json({ user: { id: result.user.id, email: result.user.email } })
  } catch (error) {
    const status = error instanceof BrowserSessionError ? error.status : 500
    const code = error instanceof BrowserSessionError ? error.code : 'SERVER_ERROR'
    res.status(status).json({ error: code, code })
  }
}
