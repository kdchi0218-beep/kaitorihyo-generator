import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createStore, deleteStore, createUserInStore } from '../lib/storeSync.js'
import { generateAccountPassword, isValidAccountPasswordLength } from '../lib/accountPassword.js'
import { browserAdminApi, usersForStore } from '../lib/browserAdmin.js'
import { nextFocusableIndex } from '../lib/helpFocus.js'
import HelpGuide from './HelpGuide.jsx'

function formatDate(value) {
  return value
    ? new Intl.DateTimeFormat('ja-JP', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
    : '—'
}

function BrowserUserRow({ user, currentEmail, busy, onReset, onDelete }) {
  const isCurrent = String(user.email).toLowerCase() === String(currentEmail).toLowerCase()
  return (
    <div className="py-2.5 flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold text-[#1e3a5f] truncate">
          {user.email}
          {user.isAdmin && <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">管理者</span>}
          {isCurrent && <span className="ml-2 text-[9px] text-[#8c95a4]">現在のアカウント</span>}
        </div>
        <div className="text-[10px] text-[#8c95a4] mt-1">
          {user.browser.bound
            ? `登録 ${formatDate(user.browser.boundAt)}・最終利用 ${formatDate(user.browser.lastSeenAt)}`
            : '最初にログインしたブラウザへ固定されます'}
        </div>
      </div>
      <span className={`text-[10px] font-semibold ${user.browser.bound ? 'text-green-700' : 'text-amber-600'}`}>
        {user.browser.bound ? '🔒 このブラウザに固定中' : '○ 未ログイン'}
      </span>
      <button
        onClick={() => onReset(user)}
        disabled={busy || !user.browser.bound || isCurrent}
        title={isCurrent ? '別の管理者から解除してください' : ''}
        className="text-[11px] px-3 py-1.5 rounded border border-amber-200 text-amber-700 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      >端末ロック解除</button>
      {onDelete && (
        <button
          onClick={() => onDelete(user)}
          disabled={busy || isCurrent}
          className="text-[11px] px-3 py-1.5 rounded border border-red-200 text-red-600 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >アカウント削除</button>
      )}
    </div>
  )
}

function DeleteAccountDialog({ target, email, reason, error, busy, onEmailChange, onReasonChange, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const emailRef = useRef(null)
  const emailMatches = email.trim().toLowerCase() === target.email.trim().toLowerCase()
  const trimmedReason = reason.trim()
  const canDelete = emailMatches && trimmedReason.length >= 2 && trimmedReason.length <= 200 && !busy

  useEffect(() => {
    const opener = document.activeElement
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    emailRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = originalOverflow
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }, [])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.key === 'Escape' && !busy) {
        onCancel()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])]
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus()
        return
      }
      const nextIndex = nextFocusableIndex(focusable.indexOf(document.activeElement), focusable.length, event.shiftKey)
      if (nextIndex < 0) return
      event.preventDefault()
      focusable[nextIndex].focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  useEffect(() => {
    if (busy) dialogRef.current?.focus({ preventScroll: true })
  }, [busy])

  const storesLabel = target.stores?.length ? target.stores.join('、') : '所属店舗すべて'

  return createPortal(
    <div
      role="presentation"
      className="p-3 sm:p-5"
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.62)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={event => { if (!busy && event.target === event.currentTarget) onCancel() }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        aria-describedby="delete-account-description"
        tabIndex={-1}
        className="w-full max-w-lg max-h-[92svh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
      >
        <header className="px-5 py-4 border-b border-red-100 bg-red-50">
          <h2 id="delete-account-title" className="text-base font-bold text-red-700">アカウントを完全に削除</h2>
          <p id="delete-account-description" className="text-xs text-red-700 mt-1.5 leading-5">
            この操作は元に戻せません。ログイン情報・端末固定・すべての店舗所属が削除されます。
          </p>
        </header>

        <form className="min-h-0 overflow-y-auto" onSubmit={event => { event.preventDefault(); if (canDelete) onConfirm() }}>
          <div className="px-5 py-5 space-y-4">
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                {error}
              </p>
            )}
            <div className="rounded-lg border border-[#e0e4ea] bg-[#f8f9fb] px-3 py-3 text-xs text-[#4b5870]">
              <p><span className="font-semibold">対象:</span> {target.email}</p>
              <p className="mt-1"><span className="font-semibold">所属:</span> {storesLabel}</p>
              <p className="mt-2 text-red-600">どの店舗欄から操作しても、上記アカウントそのものを全店舗から削除します。</p>
            </div>

            <div>
              <label htmlFor="delete-account-email" className="block text-xs font-semibold text-[#1e3a5f] mb-1.5">
                確認のため「{target.email}」を入力
              </label>
              <input
                ref={emailRef}
                id="delete-account-email"
                type="email"
                value={email}
                onChange={event => onEmailChange(event.target.value)}
                autoComplete="off"
                disabled={busy}
                className="w-full text-sm px-3 py-2.5 border border-[#d0d5dd] rounded-lg outline-none focus:border-red-500 disabled:bg-[#f3f4f6]"
              />
              {email && !emailMatches && <p className="text-[11px] text-red-600 mt-1">メールアドレスが一致しません。</p>}
            </div>

            <div>
              <label htmlFor="delete-account-reason" className="block text-xs font-semibold text-[#1e3a5f] mb-1.5">削除理由（2〜200文字）</label>
              <textarea
                id="delete-account-reason"
                value={reason}
                onChange={event => onReasonChange(event.target.value)}
                maxLength={200}
                disabled={busy}
                placeholder="例: 退職のため"
                rows={3}
                className="w-full resize-y text-sm px-3 py-2.5 border border-[#d0d5dd] rounded-lg outline-none focus:border-red-500 disabled:bg-[#f3f4f6]"
              />
              <p className="text-[10px] text-[#8c95a4] text-right mt-1">{reason.length} / 200</p>
            </div>
          </div>

          <footer className="flex justify-end gap-2 px-5 py-4 border-t border-[#e0e4ea] bg-[#fafbfc]">
            <button type="button" onClick={onCancel} disabled={busy}
              className="text-sm px-4 py-2 rounded-lg border border-[#d0d5dd] text-[#5a6577] cursor-pointer disabled:opacity-50">
              キャンセル
            </button>
            <button type="submit" disabled={!canDelete}
              className="text-sm px-4 py-2 rounded-lg bg-red-600 text-white font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              {busy ? '削除中...' : '完全に削除する'}
            </button>
          </footer>
        </form>
      </section>
    </div>,
    document.body,
  )
}

export default function AdminPanel({ stores, onRefresh, onClose, canClose, userEmail, onLogout }) {
  const [newStoreName, setNewStoreName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [memberForms, setMemberForms] = useState({}) // { storeId: {email} }
  const [browserUsers, setBrowserUsers] = useState([])
  const [browserLoading, setBrowserLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deleteReason, setDeleteReason] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const messageRef = useRef(null)

  const note = (type, message, focus = false) => setMsg({ type, message, focus })

  useEffect(() => {
    if (msg?.focus) messageRef.current?.focus({ preventScroll: true })
  }, [msg])

  const loadBrowserUsers = useCallback(async () => {
    setBrowserLoading(true)
    try {
      setBrowserUsers(await browserAdminApi.list())
      return null
    } catch (error) {
      note('error', error.message)
      return error
    }
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
    if (!isValidAccountPasswordLength(form.password)) {
      note('error', 'パスワードは8文字以上かつUTF-8で72バイト以下にしてください')
      return
    }
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

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null)
    setDeleteEmail('')
    setDeleteReason('')
    setDeleteError('')
  }, [])

  const openDeleteDialog = (user) => {
    setDeleteTarget(user)
    setDeleteEmail('')
    setDeleteReason('')
    setDeleteError('')
    setMsg(null)
  }

  const handleDeleteUser = async () => {
    if (!deleteTarget) return
    if (deleteEmail.trim().toLowerCase() !== deleteTarget.email.trim().toLowerCase()) {
      setDeleteError('確認用メールアドレスが一致しません')
      return
    }
    const reason = deleteReason.trim()
    if (reason.length < 2 || reason.length > 200) {
      setDeleteError('削除理由は2〜200文字で入力してください')
      return
    }
    setBusy(true); setMsg(null); setDeleteError('')
    try {
      await browserAdminApi.remove(deleteTarget.id, deleteTarget.email, reason)
      const deletedEmail = deleteTarget.email
      const deletedId = deleteTarget.id
      setBrowserUsers(previous => previous.filter(user => user.id !== deletedId))
      const reloadError = await loadBrowserUsers()
      if (reloadError) {
        note('error', `${deletedEmail} は削除しましたが、一覧の再読込に失敗しました。再読込してください。`, true)
      } else {
        note('success', `${deletedEmail} のアカウントを削除しました`, true)
      }
      closeDeleteDialog()
    } catch (error) { setDeleteError(error.message) }
    finally { setBusy(false) }
  }

  const adminUsers = browserUsers.filter(user => user.isAdmin)

  return (
    <>
      <div style={{ minHeight: '100vh', width: '100vw', background: '#eef1f6', overflow: 'auto' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-[#1e3a5f]">とんとん 店舗・ユーザー管理</h1>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-[#8c95a4]">{userEmail}</span>
            <HelpGuide />
            {canClose && (
              <button onClick={onClose} className="text-xs px-3 py-1.5 rounded bg-[#1e3a5f] text-white cursor-pointer">
                買取表に戻る
              </button>
            )}
            <button onClick={onLogout} className="text-[11px] text-[#8c95a4] hover:text-red-500 cursor-pointer">ログアウト</button>
          </div>
        </div>

        {msg && (
          <div ref={messageRef} role={msg.type === 'success' ? 'status' : 'alert'} aria-live="polite" tabIndex={-1}
            className={`text-xs px-3 py-2 rounded mb-4 border ${
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
          const storeUsers = usersForStore(browserUsers, s.id)
          return (
            <div key={s.id} className="bg-white rounded-xl border border-[#e0e4ea] p-4 mb-3">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-[#1e3a5f]">{s.name}</h3>
                <button onClick={() => handleDeleteStore(s)}
                  className="text-[11px] text-red-500 hover:underline cursor-pointer">店舗を削除</button>
              </div>

              <div className="rounded-lg border border-[#edf0f4] bg-[#fafbfc] px-3 mb-4">
                <div className="flex items-center justify-between pt-3 pb-1">
                  <div className="text-[11px] font-semibold text-[#5a6577]">
                    登録済みアカウント（{storeUsers.length}件）
                  </div>
                  <button onClick={loadBrowserUsers} disabled={browserLoading || busy}
                    className="text-[10px] text-[#6b7482] hover:underline cursor-pointer disabled:opacity-50">
                    再読込
                  </button>
                </div>
                {browserLoading ? (
                  <p className="text-[11px] text-[#8c95a4] py-3">アカウントを読み込み中...</p>
                ) : storeUsers.length === 0 ? (
                  <p className="text-[11px] text-[#8c95a4] py-3">まだアカウントはありません。</p>
                ) : (
                  <div className="divide-y divide-[#edf0f4]">
                    {storeUsers.map(user => (
                      <BrowserUserRow key={user.id} user={user} currentEmail={userEmail} busy={busy}
                        onReset={handleResetBrowser} onDelete={openDeleteDialog} />
                    ))}
                  </div>
                )}
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
                    type="password" minLength={8} maxLength={72} autoComplete="new-password"
                    placeholder="パスワード（8文字以上）"
                    className="w-36 text-sm px-3 py-2 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
                  />
                  <button onClick={() => setForm(s.id, { password: generateAccountPassword() })}
                    className="text-[11px] px-2 py-2 rounded border border-[#d0d5dd] text-[#5a6577] hover:bg-[#f8f9fb] cursor-pointer whitespace-nowrap">生成</button>
                </div>
                <button onClick={() => handleCreateUser(s.id, s.name)} disabled={busy}
                  className="text-sm px-4 py-2 rounded bg-[#3d7c4f] text-white cursor-pointer disabled:opacity-60">アカウント発行</button>
              </div>
              <p className="text-[10px] text-[#8c95a4] mt-1">パスワードは8文字以上・UTF-8で72バイト以下。「生成」は全推奨文字種を含む安全な16文字です。</p>
            </div>
          )
        })}

        <div className="bg-white rounded-xl border border-[#e0e4ea] p-4 mt-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-bold text-[#1e3a5f]">管理者ブラウザ固定</h2>
              <p className="text-[10px] text-[#8c95a4] mt-1">管理者のPC交換時は、別の管理者から端末ロックを解除してください。</p>
            </div>
            <button onClick={loadBrowserUsers} disabled={browserLoading || busy}
              className="text-[11px] px-3 py-1.5 rounded border border-[#d0d5dd] text-[#5a6577] cursor-pointer disabled:opacity-60">
              再読込
            </button>
          </div>

          {browserLoading ? (
            <p className="text-xs text-[#8c95a4] py-4 text-center">管理者を読み込み中...</p>
          ) : adminUsers.length === 0 ? (
            <p className="text-xs text-[#8c95a4] py-4 text-center">管理者が見つかりません。</p>
          ) : (
            <div className="divide-y divide-[#edf0f4]">
              {adminUsers.map(user => (
                <BrowserUserRow key={user.id} user={user} currentEmail={userEmail} busy={busy} onReset={handleResetBrowser} />
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      {deleteTarget && typeof document !== 'undefined' && (
        <DeleteAccountDialog
          target={deleteTarget}
          email={deleteEmail}
          reason={deleteReason}
          error={deleteError}
          busy={busy}
          onEmailChange={value => { setDeleteEmail(value); setDeleteError('') }}
          onReasonChange={value => { setDeleteReason(value); setDeleteError('') }}
          onCancel={closeDeleteDialog}
          onConfirm={handleDeleteUser}
        />
      )}
    </>
  )
}
