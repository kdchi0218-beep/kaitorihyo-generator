import { useCallback, useEffect, useState } from 'react'
import { createStore, deleteStore, createUserInStore } from '../lib/storeSync.js'
import { browserAdminApi } from '../lib/browserAdmin.js'

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
  const [browserUsers, setBrowserUsers] = useState([])
  const [browserLoading, setBrowserLoading] = useState(true)

  const note = (type, message) => setMsg({ type, message })

  const loadBrowserUsers = useCallback(async () => {
    setBrowserLoading(true)
    try { setBrowserUsers(await browserAdminApi.list()) }
    catch (error) { note('error', error.message) }
    finally { setBrowserLoading(false) }
  }, [])

  useEffect(() => { loadBrowserUsers() }, [loadBrowserUsers])

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
      await loadBrowserUsers()
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  const handleResetBrowser = async (user) => {
    if (user.email === userEmail) {
      note('error', '現在ログイン中の管理者自身は解除できません。別の管理者から解除してください。')
      return
    }
    const reason = prompt(`${user.email} のブラウザ登録を解除する理由を入力してください`, 'PC交換・ブラウザ変更')
    if (!reason?.trim()) return
    if (!confirm(`${user.email} のブラウザ固定を解除しますか？\n解除後は、次にログインしたブラウザへ固定されます。`)) return
    setBusy(true); setMsg(null)
    try {
      await browserAdminApi.reset(user.id, reason.trim())
      await loadBrowserUsers()
      note('success', `${user.email} のブラウザ登録を解除しました`)
    } catch (error) { note('error', error.message) }
    finally { setBusy(false) }
  }

  const formatDate = value => value
    ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '—'

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

        <div className="bg-white rounded-xl border border-[#e0e4ea] p-4 mt-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1e3a5f]">ブラウザ固定の管理</h2>
              <p className="text-[10px] text-[#8c95a4] mt-1">初回ログインしたブラウザだけ利用できます。PC交換時はここで登録を解除してください。</p>
            </div>
            <button onClick={loadBrowserUsers} disabled={browserLoading || busy}
              className="text-[11px] px-3 py-1.5 rounded border border-[#d0d5dd] text-[#5a6577] cursor-pointer disabled:opacity-60">
              再読込
            </button>
          </div>

          {browserLoading ? (
            <p className="text-xs text-[#8c95a4] py-4 text-center">ユーザーを読み込み中...</p>
          ) : browserUsers.length === 0 ? (
            <p className="text-xs text-[#8c95a4] py-4 text-center">ユーザーがまだありません。</p>
          ) : (
            <div className="divide-y divide-[#edf0f4]">
              {browserUsers.map(user => (
                <div key={user.id} className="py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#1e3a5f] truncate">
                      {user.email}
                      {user.isAdmin && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">管理者</span>}
                      {user.email === userEmail && <span className="ml-2 text-[9px] text-[#8c95a4]">現在のアカウント</span>}
                    </div>
                    <div className="text-[10px] text-[#8c95a4] mt-1">
                      {user.stores.length ? user.stores.join('・') : (user.isAdmin ? '全店舗' : '店舗未割当')}
                      {' / '}
                      {user.browser.bound
                        ? `固定済み（登録 ${formatDate(user.browser.boundAt)}・最終利用 ${formatDate(user.browser.lastSeenAt)}）`
                        : '未登録（次の初回ログインで固定）'}
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold ${user.browser.bound ? 'text-green-700' : 'text-amber-600'}`}>
                    {user.browser.bound ? '● 固定済み' : '○ 未登録'}
                  </span>
                  <button
                    onClick={() => handleResetBrowser(user)}
                    disabled={busy || !user.browser.bound || user.email === userEmail}
                    title={user.email === userEmail ? '別の管理者から解除してください' : ''}
                    className="text-[11px] px-3 py-1.5 rounded border border-red-200 text-red-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >ブラウザ登録を解除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
