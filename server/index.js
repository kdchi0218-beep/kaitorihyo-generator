import express from 'express'
import pg from 'pg'
import cors from 'cors'

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

app.listen(3001, () => {
  console.log('Kaitori API running on port 3001')
})
