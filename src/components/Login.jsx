import { useState } from 'react'

const USERS = [
  {
    id: 'sougoukanri',
    hash: '222817638',
    format: 'carddesk',
  },
  {
    id: 'tsuchiya',
    hash: '-1943143077',
    format: 'carddesk',
  },
  {
    id: 'tonton001',
    hash: '1503068194',
    format: 'tonton',
    label: 'トントン秋葉原店',
  },
  {
    id: 'tonton002',
    hash: '1503068194',
    format: 'tonton',
    label: 'トントン日本橋店',
  },
]

function simpleHash(text) {
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return String(hash)
}

export default function Login({ onLogin }) {
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const hash = simpleHash(password)
    const user = USERS.find(u => u.id === userId && u.hash === hash)

    if (user) {
      localStorage.setItem('auth', 'true')
      localStorage.setItem('userEmail', user.id)
      localStorage.setItem('userFormat', user.format)
      localStorage.setItem('userLabel', user.label || user.id)
      onLogin(user.id)
    } else {
      setError('IDまたはパスワードが正しくありません')
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
      background: '#f5f7fa',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
        width: '380px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <img src="./carddesk-logo.png" alt="CardDesk" style={{ height: '36px', margin: '0 auto' }} />
        </div>
        <h1 style={{
          fontSize: '18px',
          fontWeight: '700',
          marginBottom: '8px',
          color: '#1e3a5f',
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
          ID
        </label>
        <input
          type="text"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          required
          autoComplete="username"
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
          autoComplete="current-password"
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
            background: '#1e3a5f',
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
