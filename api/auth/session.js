import { BrowserSessionError, authenticateBoundRequest } from '../_lib/browser-session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).json({ error: 'METHOD_NOT_ALLOWED' }); return }
  try {
    const auth = await authenticateBoundRequest(req, res)
    res.status(200).json({ user: { id: auth.user.id, email: auth.user.email } })
  } catch (error) {
    const status = error instanceof BrowserSessionError ? error.status : 500
    const code = error instanceof BrowserSessionError ? error.code : 'SERVER_ERROR'
    res.status(status).json({ error: code, code })
  }
}
