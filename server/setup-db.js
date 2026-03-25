import pg from 'pg'

const pool = new pg.Pool({
  database: process.env.DB_NAME || 'kaitori',
  user: process.env.DB_USER || 'kaitori_user',
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
})

async function setup() {
  console.log('Creating table...')

  await pool.query(`
    CREATE TABLE IF NOT EXISTS templates (
      id SERIAL PRIMARY KEY,
      user_email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      settings JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_templates_user ON templates (user_email)
  `)

  console.log('Done!')
  await pool.end()
}

setup().catch(err => {
  console.error(err)
  process.exit(1)
})
