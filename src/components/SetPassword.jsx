import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

// 招待メールのリンクから着地したユーザーが、初回パスワードを設定する画面
export default function SetPassword({ email, onDone, onCancel }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) { setError('パスワードは8文字以上にしてください'); return }
    if (pw !== pw2) { setError('パスワードが一致しません'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) { setError(error.message); setLoading(false); return }
    onDone()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', background: '#0f1b2d' }}>
      <form onSubmit={submit} style={{ background: '#fff', padding: 40, borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.35)', width: 380 }}>
        <h1 style={{ fontSize: 18, fontWeight: 800, color: '#1e3a5f', textAlign: 'center', marginBottom: 6 }}>パスワードの設定</h1>
        <p style={{ fontSize: 12, color: '#999', textAlign: 'center', marginBottom: 24 }}>
          {email ? `${email} の` : ''}初回パスワードを設定してください
        </p>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>新しいパスワード（8文字以上）</label>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} required autoComplete="new-password"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginTop: 6, marginBottom: 16, outline: 'none', boxSizing: 'border-box' }} />

        <label style={{ fontSize: 13, fontWeight: 600, color: '#555' }}>もう一度入力</label>
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} required autoComplete="new-password"
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, marginTop: 6, marginBottom: 24, outline: 'none', boxSizing: 'border-box' }} />

        <button type="submit" disabled={loading}
          style={{ width: '100%', padding: 12, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? '設定中...' : 'パスワードを設定してログイン'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} style={{ width: '100%', marginTop: 10, background: 'none', border: 'none', color: '#8c95a4', fontSize: 12, cursor: 'pointer' }}>
            キャンセル
          </button>
        )}
      </form>
    </div>
  )
}
