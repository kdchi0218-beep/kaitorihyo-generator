// Vercel Serverless Function: 外部画像の中継（買取表出力時のCORS対策の保険）
// 直接fetchできない画像ドメインのフォールバック用。許可ドメインを限定（SSRF対策）。
//
// GET /api/image-proxy?url=<encodeURIComponentした画像URL>

export default async function handler(req, res) {
  try {
    const url = req.query?.url
    if (!url) { res.status(400).send('url required'); return }

    let parsed
    try { parsed = new URL(url) } catch { res.status(400).send('invalid url'); return }

    const host = parsed.hostname
    const allowed =
      host.endsWith('.supabase.co') ||
      host.endsWith('.cardrush.media') ||
      host === 'files.cardrush.media' ||
      host === 'www.cardrush-pokemon.jp' ||
      host === 'www.cardrush-op.jp' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'firebasestorage.googleapis.com' ||
      host === 'storage.googleapis.com'

    if (!allowed) { res.status(403).send('domain not allowed'); return }

    const upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'TontonKaitoriGenerator/1.0' },
    })
    if (!upstream.ok) { res.status(upstream.status).send(`upstream ${upstream.status}`); return }

    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.status(200).send(buf)
  } catch (err) {
    res.status(500).send(`proxy error: ${err?.message || 'unknown'}`)
  }
}
