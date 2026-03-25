import { useState } from 'react'

const USERS = [
  {
    email: 'sougoukanri@card-desk.com',
    hash: '979be31736646624adc795ea0916f74d7e20eef4256dde7a100c33852375904e',
  },
  {
    email: 'tsuchiya@aclass-group.com',
    hash: '914dbd8d2fbf410e4d31139db9b26af4804486fed6b8e25accdfc0653d0e3df7',
  },
]

async function sha256(text) {
  const encoded = new TextEncoder().encode(text)
  const buffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const hash = await sha256(password)
    const user = USERS.find(u => u.email === email && u.hash === hash)

    if (user) {
      sessionStorage.setItem('auth', 'true')
      onLogin()
    } else {
      setError('メールアドレスまたはパスワードが正しくありません')
    }
    setLoading(false)
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      width: '100vw',
      background: '#faf8f4',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        width: '380px',
      }}>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          marginBottom: '8px',
          color: '#3a3530',
          textAlign: 'center',
        }}>
          買取表ジェネレーター
        </h1>
        <p style={{
          fontSize: '13px',
          color: '#999',
          textAlign: 'center',
          marginBottom: '28px',
        }}>
          ログインしてください
        </p>

        {error && (
          <div style={{
            background: '#fef2f2',
            color: '#dc2626',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '13px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>
          メールアドレス
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '14px',
            marginTop: '6px',
            marginBottom: '16px',
            outline: 'none',
          }}
        />

        <label style={{ fontSize: '13px', fontWeight: '600', color: '#555' }}>
          パスワード
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '10px 12px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            fontSize: '14px',
            marginTop: '6px',
            marginBottom: '24px',
            outline: 'none',
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            background: '#3a3530',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
