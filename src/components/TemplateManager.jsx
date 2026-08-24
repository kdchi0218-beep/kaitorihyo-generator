import { useState, useEffect, useCallback } from 'react'
import { listTemplates, saveTemplate, updateTemplate, deleteTemplate, renameTemplate } from '../lib/sharedTemplates.js'
import { DEFAULT_SETTINGS } from '../lib/defaults.js'
import { mergePersistedAssetUrls } from '../lib/settingsAssets.js'

const ROUND_LABEL = { ceil: '繰り上げ', round: '四捨五入', floor: '切り捨て' }

// テンプレの価格設定を分かりやすい行配列にする
function priceSummary(s = {}) {
  const lines = []
  lines.push(`基本: 掛け率 ${s.ratePercent ?? 0}% / 定額 ${s.priceFlatAdjust ?? 0}円`)
  lines.push(`端数: ${s.priceUnit ?? 100}円 ${ROUND_LABEL[s.priceRounding] || ''}`)
  if (Array.isArray(s.priceTiers) && s.priceTiers.length) {
    lines.push('金額帯:')
    s.priceTiers.forEach(t => {
      const max = (t.max === '' || t.max == null) ? '上限なし' : `${t.max}円`
      const extra = []
      if (t.unit != null && t.unit !== '') extra.push(`${t.unit}円`)
      if (t.rounding) extra.push(ROUND_LABEL[t.rounding] || '')
      const extraStr = extra.length ? `（端数 ${extra.join(' ')}）` : ''
      lines.push(`　${t.min ?? 0}円〜${max} → ${t.ratePercent ?? 0}% / ${t.flatAdjust ?? 0}円${extraStr}`)
    })
  }
  return lines
}

// テンプレート（店舗内のみ共有・ジャンル別・Supabase）。同じ店舗のアカウント間で共有。
export default function TemplateManager({ settings, setSettings, genre, storeId, stores = [], assetUploadBusy = false }) {
  const [templates, setTemplates] = useState([])
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [detailId, setDetailId] = useState(null)
  const [sendId, setSendId] = useState(null)
  const [sendTarget, setSendTarget] = useState('')

  const reload = useCallback(async () => {
    if (!storeId) return
    setLoading(true)
    try { setTemplates(await listTemplates(storeId, genre)) }
    catch (e) { showMessage('読み込み失敗: ' + e.message) }
    finally { setLoading(false) }
  }, [storeId, genre])

  useEffect(() => { reload() }, [reload])

  const showMessage = (text) => {
    // 失敗系メッセージはエラー扱い（赤表示）にする
    const isError = /失敗|エラー/.test(text)
    setMessage({ text, isError })
    setTimeout(() => setMessage(null), isError ? 5000 : 2500)
  }

  const handleSave = async () => {
    if (!newName.trim() || !storeId) return
    if (assetUploadBusy) { showMessage('保存失敗: 画像のアップロードが終わってから保存してください'); return }
    setBusy(true)
    try {
      const sourceSettings = settings
      const persistedSettings = await saveTemplate(storeId, genre, newName.trim(), sourceSettings)
      setSettings(current => mergePersistedAssetUrls(current, sourceSettings, persistedSettings))
      setNewName('')
      await reload()
      showMessage('保存しました（この店舗内で共有）')
    } catch (e) { showMessage('保存失敗: ' + e.message) } finally { setBusy(false) }
  }

  const handleLoad = (t) => {
    if (assetUploadBusy) { showMessage('操作失敗: 画像のアップロードが終わってから操作してください'); return }
    setSettings(prev => ({ ...prev, ...t.settings }))
    showMessage(`「${t.name}」を読み込みました`)
  }

  const handleOverwrite = async (t) => {
    if (assetUploadBusy) { showMessage('保存失敗: 画像のアップロードが終わってから保存してください'); return }
    if (!confirm(`「${t.name}」を今の設定で上書きしますか？`)) return
    setBusy(true)
    try {
      const sourceSettings = settings
      const persistedSettings = await updateTemplate(t.id, t.name, sourceSettings, storeId)
      setSettings(current => mergePersistedAssetUrls(current, sourceSettings, persistedSettings))
      await reload()
      showMessage(`「${t.name}」を上書き保存しました`)
    } catch (e) { showMessage('上書き失敗: ' + e.message) } finally { setBusy(false) }
  }

  const handleDelete = async (t) => {
    if (!confirm(`「${t.name}」を削除しますか？（この店舗から消えます）`)) return
    setBusy(true)
    try { await deleteTemplate(t.id); await reload(); showMessage('削除しました') }
    catch (e) { showMessage('削除失敗: ' + e.message) } finally { setBusy(false) }
  }

  const handleSend = async (t) => {
    if (!sendTarget) return
    setBusy(true)
    try {
      await saveTemplate(sendTarget, genre, t.name, t.settings)
      const storeName = stores.find(s => s.id === sendTarget)?.name || '他店舗'
      showMessage(`「${t.name}」を ${storeName} に送信しました`)
      setSendId(null); setSendTarget('')
    } catch (e) { showMessage('送信失敗: ' + e.message) } finally { setBusy(false) }
  }

  const otherStores = stores.filter(s => s.id !== storeId)

  const startRename = (t) => { setEditId(t.id); setEditName(t.name) }
  const commitRename = async () => {
    if (!editId || !editName.trim()) { setEditId(null); return }
    setBusy(true)
    try { await renameTemplate(editId, editName.trim()); setEditId(null); await reload(); showMessage('名前を変更しました') }
    catch (e) { showMessage('変更失敗: ' + e.message) } finally { setBusy(false) }
  }

  const handleReset = () => {
    if (assetUploadBusy) { showMessage('操作失敗: 画像のアップロードが終わってから操作してください'); return }
    setSettings({ ...DEFAULT_SETTINGS })
    showMessage('デフォルトに戻しました')
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-[#5a6577] block mb-1">新規保存（この店舗内）</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
            placeholder="テンプレート名..."
            className="flex-1"
          />
          <button
            onClick={handleSave}
            disabled={busy || assetUploadBusy || !newName.trim()}
            className="px-3 py-1 rounded bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-40 text-white text-xs cursor-pointer"
          >
            保存
          </button>
        </div>
        <button
          onClick={handleReset}
          disabled={assetUploadBusy}
          className="mt-2 text-[11px] px-2 py-1 rounded bg-[#dfe3ea] hover:bg-[#d0d5dd] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
        >
          設定をデフォルトに戻す
        </button>
      </div>

      {loading && <div className="text-xs text-[#8c95a4]">読み込み中...</div>}

      {templates.length > 0 && (
        <div>
          <label className="text-xs text-[#5a6577] block mb-1">保存済みテンプレート（この店舗内）</label>
          <div className="space-y-1">
            {templates.map(t => (
              <div key={t.id} className="bg-[#eef1f6] rounded px-2 py-1.5 border border-[#e0e4ea]">
                <div className="flex items-center gap-1.5">
                  {editId === t.id ? (
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditId(null) }}
                      autoFocus
                      className="flex-1 text-xs px-1.5 py-0.5 border border-[#1e3a5f] rounded outline-none"
                    />
                  ) : (
                    <span className="flex-1 text-xs text-[#1e3a5f] truncate cursor-pointer" onClick={() => setDetailId(detailId === t.id ? null : t.id)} title="クリックで詳細">
                      {t.name}
                    </span>
                  )}
                  <button onClick={() => setDetailId(detailId === t.id ? null : t.id)} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#d0d5dd] text-[#5a6577] hover:bg-[#f8f9fb] cursor-pointer">詳細</button>
                  <button onClick={() => startRename(t)} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-[#d0d5dd] text-[#5a6577] hover:bg-[#f8f9fb] cursor-pointer">名前</button>
                  {otherStores.length > 0 && (
                    <button onClick={() => { setSendId(sendId === t.id ? null : t.id); setSendTarget('') }} className="text-[11px] px-1.5 py-0.5 rounded bg-[#3d7c4f]/10 border border-[#3d7c4f]/40 text-[#3d7c4f] hover:bg-[#3d7c4f]/20 cursor-pointer">送信</button>
                  )}
                  <button onClick={() => handleLoad(t)} disabled={assetUploadBusy} className="text-[11px] px-1.5 py-0.5 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer disabled:opacity-50">読込</button>
                  <button onClick={() => handleOverwrite(t)} disabled={busy || assetUploadBusy} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer">上書</button>
                  <button onClick={() => handleDelete(t)} disabled={busy} className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-600 cursor-pointer">削除</button>
                </div>
                {sendId === t.id && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#d0d5dd] flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-[#5a6577]">送信先の店舗:</span>
                    <select value={sendTarget} onChange={e => setSendTarget(e.target.value)} className="text-[11px] px-2 py-1 border border-[#d0d5dd] rounded bg-white">
                      <option value="">選択...</option>
                      {otherStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <button onClick={() => handleSend(t)} disabled={!sendTarget || busy} className="text-[11px] px-2 py-1 rounded bg-[#3d7c4f] text-white cursor-pointer disabled:opacity-50">この店舗に送信</button>
                    <button onClick={() => setSendId(null)} className="text-[10px] text-[#8c95a4] cursor-pointer">キャンセル</button>
                  </div>
                )}
                {detailId === t.id && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#d0d5dd] text-[10px] text-[#5a6577] leading-relaxed">
                    <div className="font-semibold text-[#1e3a5f] mb-0.5">買取価格ルール</div>
                    {priceSummary(t.settings).map((line, i) => (
                      <div key={i} className={line.startsWith('　') ? 'pl-1' : ''}>{line}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className={`text-xs px-2 py-1 rounded border ${
          message.isError ? 'text-red-700 bg-red-50 border-red-200' : 'text-green-700 bg-green-50 border-green-200'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  )
}
