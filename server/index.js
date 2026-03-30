import express from 'express'
import pg from 'pg'
import cors from 'cors'
import puppeteer from 'puppeteer'

const app = express()

// CORS制限: app.card-desk.comのみ許可
app.use(cors({
  origin: ['https://app.card-desk.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

app.use(express.json({ limit: '10mb' }))

// DB接続: 環境変数から取得
const pool = new pg.Pool({
  database: process.env.DB_NAME || 'kaitori',
  user: process.env.DB_USER || 'kaitori_user',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
})

// 起動時にDB接続確認
pool.query('SELECT 1').catch(err => {
  console.error('DB接続失敗:', err.message)
  process.exit(1)
})

// テンプレート一覧取得
app.get('/api/templates', async (req, res) => {
  try {
    const { email } = req.query
    if (!email) return res.status(400).json({ error: 'email required' })

    const { rows } = await pool.query(
      'SELECT id, name, settings, updated_at FROM templates WHERE user_email = $1 ORDER BY updated_at DESC',
      [email]
    )
    res.json(rows)
  } catch (err) {
    console.error('GET /api/templates error:', err.message)
    res.status(500).json({ error: 'server error' })
  }
})

// テンプレート保存
app.post('/api/templates', async (req, res) => {
  try {
    const { email, name, settings } = req.body
    if (!email || !name || !settings) return res.status(400).json({ error: 'email, name, settings required' })

    const { rows } = await pool.query(
      'INSERT INTO templates (user_email, name, settings) VALUES ($1, $2, $3) RETURNING id, name, settings, updated_at',
      [email, name, JSON.stringify(settings)]
    )
    res.json(rows[0])
  } catch (err) {
    console.error('POST /api/templates error:', err.message)
    res.status(500).json({ error: 'server error' })
  }
})

// テンプレート更新
app.put('/api/templates/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { email, name, settings } = req.body
    if (!email) return res.status(400).json({ error: 'email required' })

    const { rows } = await pool.query(
      'UPDATE templates SET name = COALESCE($1, name), settings = COALESCE($2, settings), updated_at = NOW() WHERE id = $3 AND user_email = $4 RETURNING id, name, settings, updated_at',
      [name, settings ? JSON.stringify(settings) : null, id, email]
    )
    if (rows.length === 0) return res.status(404).json({ error: 'not found' })
    res.json(rows[0])
  } catch (err) {
    console.error('PUT /api/templates error:', err.message)
    res.status(500).json({ error: 'server error' })
  }
})

// テンプレート削除
app.delete('/api/templates/:id', async (req, res) => {
  try {
    const { email } = req.query
    if (!email) return res.status(400).json({ error: 'email required' })

    const { rowCount } = await pool.query(
      'DELETE FROM templates WHERE id = $1 AND user_email = $2',
      [req.params.id, email]
    )
    if (rowCount === 0) return res.status(404).json({ error: 'not found' })
    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/templates error:', err.message)
    res.status(500).json({ error: 'server error' })
  }
})

// 画像プロキシ: Firebase Storage等のCORS非対応画像を中継
app.get('/api/image-proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) return res.status(400).json({ error: 'url required' })

    const parsed = new URL(url)
    const allowed = [
      'firebasestorage.googleapis.com',
      'storage.googleapis.com',
      'files.cardrush.media',
      'www.cardrush-pokemon.jp',
      'www.cardrush-op.jp',
      'cardrush.media',
    ]
    if (!allowed.includes(parsed.hostname)) {
      return res.status(403).json({ error: 'domain not allowed' })
    }

    const response = await fetch(url)
    if (!response.ok) return res.status(response.status).end()

    res.set('Content-Type', response.headers.get('content-type') || 'image/png')
    res.set('Cache-Control', 'public, max-age=3600')
    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch (err) {
    console.error('Image proxy error:', err.message)
    res.status(500).json({ error: 'proxy error' })
  }
})

// --- CardRush プロキシ ---
const CR_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
  'Connection': 'keep-alive'
}

// HTMLページから__NEXT_DATA__を抜く方式（buildId不要で安定）
app.get('/api/cardrush/prices', async (req, res) => {
  try {
    const genre = req.query.genre || 'pokemon'
    const name = req.query.name
    if (!name) return res.status(400).json({ error: 'name required' })
    const pageUrl = 'https://cardrush.media/' + genre + '/buying_prices?name=' + encodeURIComponent(name) + '&limit=50&page=1&sort[key]=amount&sort[order]=desc'
    const response = await fetch(pageUrl, { headers: CR_HEADERS })
    if (!response.ok) return res.status(response.status).json({ error: 'CardRush ' + response.status })
    const html = await response.text()
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
    if (!match) return res.status(500).json({ error: 'NEXT_DATA not found' })
    const data = JSON.parse(match[1])
    res.json(data)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// 商品ページ取得（Puppeteerで販売価格スクレイプ）
// GET /api/cardrush/product?genre=pokemon&id=72874
// GET /api/cardrush/product?genre=onepiece&id=3382
let browser = null
const priceCache = new Map() // { "pokemon:43860": { sellingPrice, name, ts } }
const CACHE_TTL = 60 * 60 * 1000 // 1時間キャッシュ

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
  }
  return browser
}

app.get('/api/cardrush/product', async (req, res) => {
  try {
    const genre = req.query.genre || 'pokemon'
    const id = req.query.id
    if (!id) return res.status(400).json({ error: 'id required' })

    // キャッシュチェック（1時間有効）
    const cacheKey = genre + ':' + id
    const cached = priceCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return res.json(cached.data)
    }

    const mediaGenre = genre === 'pokemon' ? 'pokemon' : 'onepiece'
    const ecDomain = genre === 'pokemon' ? 'www.cardrush-pokemon.jp' : 'www.cardrush-op.jp'
    const productUrl = 'https://' + ecDomain + '/product/' + id
    // ポケモン: files.cardrush.media (content-type: image/webp でブラウザ表示OK)
    // ワンピース: 商品ページからjpeg画像を取得 (content-type: binary/octet-streamで.webpはダウンロードされるため)
    let imageUrl = genre === 'pokemon' ? 'https://files.cardrush.media/pokemon/ocha_products/' + id + '.webp' : ''

    let sellingPrice = null
    let productName = ''
    let page = null

    // ワンピースはCloudflareなし → 直接HTMLから画像URL取得
    if (genre !== 'pokemon') {
      try {
        const htmlRes = await fetch(productUrl, { headers: CR_HEADERS })
        if (htmlRes.ok) {
          const html = await htmlRes.text()
          // 商品画像（/data/cardrush-op/product/xxx.jpeg）を探す
          const imgMatch = html.match(/(https?:\/\/www\.cardrush-op\.jp\/data\/cardrush-op\/product\/[^"'\s]+\.(?:jpeg|jpg|png))/i)
          if (imgMatch) imageUrl = imgMatch[1]
          // フォールバック: alt="画像1:" のimg
          if (!imageUrl) {
            const altMatch = html.match(/<img\s+src="([^"]+)"\s+alt="画像1:/)
            if (altMatch) imageUrl = altMatch[1]
          }
          // フォールバック: CDN webp
          if (!imageUrl) imageUrl = 'https://files.cardrush.media/onepiece/ocha_products/' + id + '.webp'
        }
      } catch (_) {
        imageUrl = 'https://files.cardrush.media/onepiece/ocha_products/' + id + '.webp'
      }
    }

    try {
      const b = await getBrowser()
      page = await b.newPage()
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
      await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 })

      // Cloudflareチャレンジページの場合は待機
      const singleTitle = await page.title()
      if (singleTitle.includes('Just a moment') || singleTitle.includes('Checking')) {
        await new Promise(r => setTimeout(r, 8000))
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
      }

      // ページ内から販売価格と商品名を抽出
      const data = await page.evaluate(() => {
        let price = null
        let name = ''

        // 商品名: titleタグ or h1
        const titleEl = document.querySelector('title')
        if (titleEl) name = titleEl.textContent.replace(/ - カードラッシュ.*$/, '').trim()

        // 販売価格を探す: 複数パターン
        const body = document.body.innerText || ''

        // パターン1: "販売価格" の近くの金額
        const m1 = body.match(/販売価格[^0-9]*?([0-9,]+)\s*円/)
        if (m1) { price = parseInt(m1[1].replace(/,/g, ''), 10); return { price, name } }

        // パターン2: "税込" の近くの金額
        const m2 = body.match(/税込[^0-9]*?([0-9,]+)\s*円/)
        if (m2) { price = parseInt(m2[1].replace(/,/g, ''), 10); return { price, name } }

        // パターン3: ¥XX,XXX パターン（最初に見つかった大きい金額）
        const priceMatches = body.match(/¥\s*([0-9,]+)/g) || []
        for (const pm of priceMatches) {
          const val = parseInt(pm.replace(/[¥,\s]/g, ''), 10)
          if (val > 0) { price = val; break }
        }

        return { price, name }
      })

      sellingPrice = data.price
      productName = data.name
    } catch (e) {
      console.error('Puppeteer error [' + id + ']:', e.message)
    } finally {
      if (page) await page.close().catch(() => {})
    }

    // 画像存在チェック
    let imageExists = false
    try {
      const imgCheck = await fetch(imageUrl, { method: 'HEAD', headers: CR_HEADERS })
      imageExists = imgCheck.ok
    } catch (_) {}

    const result = {
      id: Number(id),
      name: productName,
      imageUrl: imageExists ? imageUrl : '',
      imageExists,
      sellingPrice,
      productPageUrl: productUrl
    }

    // キャッシュに保存
    if (sellingPrice !== null) {
      priceCache.set(cacheKey, { data: result, ts: Date.now() })
    }

    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// バルク商品価格取得（複数IDを一括処理）
// POST /api/cardrush/products
// body: { genre: "pokemon", ids: [43860, 45925, 51078, ...] }
app.post('/api/cardrush/products', async (req, res) => {
  try {
    const { genre, ids } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array required' })
    }

    const mediaGenre = genre === 'pokemon' ? 'pokemon' : 'onepiece'
    const ecDomain = genre === 'pokemon' ? 'www.cardrush-pokemon.jp' : 'www.cardrush-op.jp'
    const results = {}

    // キャッシュにあるものは即返す
    const uncachedIds = []
    for (const id of ids) {
      const cacheKey = genre + ':' + id
      const cached = priceCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        results[id] = cached.data
      } else {
        uncachedIds.push(id)
      }
    }

    // キャッシュにないものをPuppeteerで順次取得（同じタブを使い回す）
    if (uncachedIds.length > 0) {
      const b = await getBrowser()
      const page = await b.newPage()
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')

      for (const id of uncachedIds) {
        const productUrl = 'https://' + ecDomain + '/product/' + id
        const imageUrl = 'https://files.cardrush.media/' + mediaGenre + '/ocha_products/' + id + '.webp'
        let sellingPrice = null
        let productName = ''

        try {
          await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 })

          // Cloudflareチャレンジページの場合は待機（最大10秒）
          const title = await page.title()
          if (title.includes('Just a moment') || title.includes('Checking')) {
            await new Promise(r => setTimeout(r, 8000))
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {})
          }

          const data = await page.evaluate(() => {
            let price = null
            let name = ''
            const titleEl = document.querySelector('title')
            if (titleEl) name = titleEl.textContent.replace(/ - カードラッシュ.*$/, '').trim()
            const body = document.body.innerText || ''
            const m1 = body.match(/販売価格[^0-9]*?([0-9,]+)\s*円/)
            if (m1) { price = parseInt(m1[1].replace(/,/g, ''), 10); return { price, name } }
            const m2 = body.match(/税込[^0-9]*?([0-9,]+)\s*円/)
            if (m2) { price = parseInt(m2[1].replace(/,/g, ''), 10); return { price, name } }
            const priceMatches = body.match(/¥\s*([0-9,]+)/g) || []
            for (const pm of priceMatches) {
              const val = parseInt(pm.replace(/[¥,\s]/g, ''), 10)
              if (val > 0) { price = val; break }
            }
            return { price, name }
          })

          sellingPrice = data.price
          productName = data.name
        } catch (e) {
          console.error('Bulk fetch error [' + id + ']:', e.message)
        }

        const result = {
          id: Number(id),
          name: productName,
          imageUrl: imageUrl,
          sellingPrice,
          productPageUrl: productUrl
        }

        results[id] = result
        if (sellingPrice !== null) {
          priceCache.set(genre + ':' + id, { data: result, ts: Date.now() })
        }
      }

      await page.close().catch(() => {})
    }

    res.json({ count: Object.keys(results).length, results })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.listen(3001, () => {
  console.log('Kaitori API running on port 3001')
})
