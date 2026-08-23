import { useState } from 'react'
import { authApi } from '../lib/authApi.js'

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await authApi.login(email, password)
      onLogin(result)
    } catch (error) {
      if (error.code === 'BROWSER_LOCKED') {
        setError('このアカウントは別のブラウザに固定されています。管理者に「ブラウザ登録の解除」を依頼してください。')
      } else {
        setError(error.code === 'INVALID_CREDENTIALS'
          ? 'メールアドレスまたはパスワードが正しくありません'
          : error.message)
      }
      setLoading(false)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw', background: '#0f1b2d',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: '#fff', padding: '40px', borderRadius: '14px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.35)', width: '380px',
      }}>
        <h1 style={{
          fontSize: '20px', fontWeight: 800, marginBottom: '4px',
          color: '#1e3a5f', textAlign: 'center', letterSpacing: '1px',
        }}>
          とんとん 買取表ジェネレーター
        </h1>
        <p style={{ fontSize: '13px', color: '#999', textAlign: 'center', marginBottom: '28px' }}>
          店舗アカウントでログイン（初回ブラウザ固定）
        </p>

        {error && (
          <div style={{
            background: '#fef2f2', color: '#dc2626', padding: '10px 14px',
            borderRadius: '8px', fontSize: '13px', marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>メールアドレス</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          required autoComplete="username"
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd',
            borderRadius: '8px', fontSize: '14px', marginTop: '6px', marginBottom: '16px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        <label style={{ fontSize: '13px', fontWeight: 600, color: '#555' }}>パスワード</label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          required autoComplete="current-password"
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #ddd',
            borderRadius: '8px', fontSize: '14px', marginTop: '6px', marginBottom: '24px',
            outline: 'none', boxSizing: 'border-box',
          }}
        />

        <button
          type="submit" disabled={loading}
          style={{
            width: '100%', padding: '12px', background: '#1e3a5f', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
      </form>
    </div>
  )
}
