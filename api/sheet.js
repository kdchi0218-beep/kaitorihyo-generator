// Vercel Serverless Function: GoogleスプシCSVエクスポートの取得プロキシ
// ブラウザのCORS制限を回避するため、サーバー側で取得して中継する。
// 許可ドメインを docs.google.com に限定（SSRF対策）。
//
// 使い方: GET /api/sheet?u=<encodeURIComponentしたCSVエクスポートURL>

export default async function handler(req, res) {
  try {
    const u = req.query?.u
    if (!u) {
      res.status(400).send('u (csv url) required')
      return
    }

    let parsed
    try {
      parsed = new URL(u)
    } catch {
      res.status(400).send('invalid url')
      return
    }

    if (parsed.hostname !== 'docs.google.com') {
      res.status(403).send('domain not allowed')
      return
    }

    const upstream = await fetch(parsed.toString(), {
      redirect: 'follow',
      headers: { 'User-Agent': 'TontonKaitoriGenerator/1.0' },
    })

    // SSRF対策: リダイレクト追跡後の最終URLもGoogle系ドメインであることを検証
    // （docs.google.com のCSVエクスポートは googleusercontent.com へ正規リダイレクトされることがある）
    const finalHost = (() => { try { return new URL(upstream.url).hostname } catch { return '' } })()
    const hostOk = finalHost === 'docs.google.com'
      || finalHost.endsWith('.googleusercontent.com')
      || finalHost.endsWith('.google.com')
    if (!hostOk) {
      res.status(403).send('redirect target not allowed')
      return
    }

    if (!upstream.ok) {
      res.status(upstream.status).send(`upstream ${upstream.status}`)
      return
    }

    const text = await upstream.text()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(200).send(text)
  } catch (err) {
    res.status(500).send(`proxy error: ${err?.message || 'unknown'}`)
  }
}
