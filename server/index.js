import express from 'express'
import pg from 'pg'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

const pool = new pg.Pool({
  database: 'kaitori',
  user: 'kaitori_user',
  password: 'kaitori_pass_2026',
  host: 'localhost',
  port: 5432,
})

// テンプレート一覧取得
app.get('/api/templates', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })

  const { rows } = await pool.query(
    'SELECT id, name, settings, updated_at FROM templates WHERE user_email = $1 ORDER BY updated_at DESC',
    [email]
  )
  res.json(rows)
})

// テンプレート保存
app.post('/api/templates', async (req, res) => {
  const { email, name, settings } = req.body
  if (!email || !name || !settings) return res.status(400).json({ error: 'email, name, settings required' })

  const { rows } = await pool.query(
    'INSERT INTO templates (user_email, name, settings) VALUES ($1, $2, $3) RETURNING id, name, settings, updated_at',
    [email, name, JSON.stringify(settings)]
  )
  res.json(rows[0])
})

// テンプレート更新
app.put('/api/templates/:id', async (req, res) => {
  const { id } = req.params
  const { email, name, settings } = req.body
  if (!email) return res.status(400).json({ error: 'email required' })

  const { rows } = await pool.query(
    'UPDATE templates SET name = COALESCE($1, name), settings = COALESCE($2, settings), updated_at = NOW() WHERE id = $3 AND user_email = $4 RETURNING id, name, settings, updated_at',
    [name, settings ? JSON.stringify(settings) : null, id, email]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'not found' })
  res.json(rows[0])
})

// テンプレート削除
app.delete('/api/templates/:id', async (req, res) => {
  const { email } = req.query
  if (!email) return res.status(400).json({ error: 'email required' })

  const { rowCount } = await pool.query(
    'DELETE FROM templates WHERE id = $1 AND user_email = $2',
    [req.params.id, email]
  )
  if (rowCount === 0) return res.status(404).json({ error: 'not found' })
  res.json({ ok: true })
})

app.listen(3001, () => {
  console.log('Kaitori API running on port 3001')
})
