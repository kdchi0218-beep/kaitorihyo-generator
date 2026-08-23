import { useState } from 'react'
import { createStore, deleteStore, createUserInStore } from '../lib/storeSync.js'

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const sym = '-_.!'
  const pool = a + sym
  const arr = new Uint32Array(16)
  crypto.getRandomValues(arr)
  let p = ''
  for (let i = 0; i < 16; i++) p += pool[arr[i] % pool.length]
  return p
}

export default function AdminPanel({ stores, onRefresh, onClose, canClose, userEmail, onLogout }) {
  const [newStoreName, setNewStoreName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [memberForms, setMemberForms] = useState({}) // { storeId: {email} }

  const note = (type, message) => setMsg({ type, message })

  const handleAddStore = async () => {
    if (!newStoreName.trim()) return
    setBusy(true); setMsg(null)
    try {
      await createStore(newStoreName.trim())
      setNewStoreName('')
      await onRefresh()
      note('success', `店舗「${newStoreName.trim()}」を追加しました`)
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  const handleDeleteStore = async (s) => {
    if (!confirm(`店舗「${s.name}」を削除しますか？\n設定・メンバー紐付けも消えます（ログインユーザー自体は残ります）`)) return
    setBusy(true); setMsg(null)
    try { await deleteStore(s.id); await onRefresh(); note('success', `「${s.name}」を削除しました`) }
    catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  const setForm = (storeId, patch) =>
    setMemberForms(prev => ({ ...prev, [storeId]: { ...(prev[storeId] || {}), ...patch } }))

  const handleCreateUser = async (storeId, storeName) => {
    const form = memberForms[storeId] || {}
    if (!form.email || !form.password) { note('error', 'メールとパスワードを入力してください'); return }
    setBusy(true); setMsg(null)
    try {
      await createUserInStore({ email: form.email.trim(), password: form.password, storeId })
      note('success', `${storeName} に発行しました ▶ ID: ${form.email.trim()} / PW: ${form.password}（このID・パスワードを店舗に伝えてください）`)
      setForm(storeId, { email: '', password: '' })
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: '#eef1f6', overflow: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#1e3a5f]">買取表 店舗・ユーザー管理</h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#8c95a4]">{userEmail}</span>
            {canClose && (
              <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[#1e3a5f] text-white cursor-pointer">
                買取表に戻る
              </button>
            )}
            <button onClick={onLogout} className="text-[11px] text-[#8c95a4] hover:text-red-500 cursor-pointer">ログアウト</button>
          </div>
        </div>

        {msg && (
          <div className={`text-xs px-3 py-2 rounded mb-4 border ${
            msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          }`}>{msg.message}</div>
        )}

        {/* 店舗追加 */}
        <div className="bg-white rounded-xl border border-[#e0e4ea] p-4 mb-4">
          <h2 className="text-sm font-bold text-[#1e3a5f] mb-2">店舗を追加</h2>
          <div className="flex gap-2">
            <input
              value={newStoreName} onChange={e => setNewStoreName(e.target.value)}
              placeholder="店舗名（例: 名古屋店）"
              className="flex-1 text-sm px-3 py-2 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
            />
            <button onClick={handleAddStore} disabled={busy}
              className="text-sm px-4 py-2 rounded bg-[#1e3a5f] text-white cursor-pointer disabled:opacity-60">追加</button>
          </div>
        </div>

        {/* 店舗一覧 */}
        {stores.length === 0 ? (
          <p className="text-sm text-[#8c95a4] text-center py-8">
            まだ店舗がありません。上で最初の店舗（例: 名古屋店）を追加してください。
          </p>
        ) : stores.map(s => {
          const form = memberForms[s.id] || {}
          return (
            <div key={s.id} className="bg-white rounded-xl border border-[#e0e4ea] p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1e3a5f]">{s.name}</h3>
                <button onClick={() => handleDeleteStore(s)}
                  className="text-[11px] text-red-500 hover:underline cursor-pointer">店舗を削除</button>
              </div>
              <div className="text-[11px] text-[#5a6577] mb-2">この店舗のログインユーザーを発行（メール＋パスワード）</div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  value={form.email || ''} onChange={e => setForm(s.id, { email: e.target.value })}
                  placeholder="メールアドレス" type="email"
                  className="flex-1 min-w-[180px] text-sm px-3 py-2 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
                />
                <div className="flex items-center gap-1">
                  <input
                    value={form.password || ''} onChange={e => setForm(s.id, { password: e.target.value })}
                    placeholder="パスワード"
                    className="w-36 text-sm px-3 py-2 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
                  />
                  <button onClick={() => setForm(s.id, { password: genPassword() })}
                    className="text-[11px] px-2 py-2 rounded border border-[#d0d5dd] text-[#5a6577] hover:bg-[#f8f9fb] cursor-pointer whitespace-nowrap">生成</button>
                </div>
                <button onClick={() => handleCreateUser(s.id, s.name)} disabled={busy}
                  className="text-sm px-4 py-2 rounded bg-[#3d7c4f] text-white cursor-pointer disabled:opacity-60">アカウント発行</button>
              </div>
              <p className="text-[10px] text-[#8c95a4] mt-1">発行後、ID（メール）とパスワードを店舗にLINE等で伝えてください。すぐログインできます。</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
