import { useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import { saveCardListItems, cardsToItems, resolveItems, enrichItems, dedupeItems } from '../lib/cardLists.js'
import { moveBlockByIndex } from '../lib/reorder.js'

// 定番リストの中身を直接編集（検索追加・削除・並べ替え）
// 登録済み判定は文字列キー比較ではなく「今日のデータ上で実際に解決される実カードid」基準。
// 旧形式（レアリティ未保存）の項目は開いた時点でレアリティを自動補完し、保存で新形式に移行する。
// 親（CardListPanel）が ref 経由で「未保存の変更があるか」「保存」を呼べる
// （ジャンル切替・リスト切替時の編集完了確認に使う）。
const CardListEditor = forwardRef(function CardListEditor({ list, allCards, cards = [], genre = '', defaultPreOpen = false, onSaved, onClose }, ref) {
  const [initialItems] = useState(() => dedupeItems(enrichItems(list.items || [], allCards)))
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  // ---- 事前登録（Excelにまだ無いカードを手入力でリストに登録）----
  const [preOpen, setPreOpen] = useState(defaultPreOpen)
  const [pre, setPre] = useState({ name: '', listNo: '', type: 'PSA10', rarity: '', img: '', price: '' })
  const setPreField = (k, v) => setPre(prev => ({ ...prev, [k]: v }))
  const typeOptions = useMemo(() => [...new Set(allCards.map(c => c.type).filter(Boolean))], [allCards])
  const addPreRegistered = () => {
    if (!pre.name.trim()) return
    const it = { listNo: pre.listNo.trim(), type: pre.type.trim() || 'PSA10', name: pre.name.trim() }
    if (genre === 'yugioh' && pre.rarity.trim()) it.rarity = pre.rarity.trim()
    if (pre.img.trim()) it.img = pre.img.trim()
    const num = Number(String(pre.price).replace(/[¥￥,、\s]/g, ''))
    if (pre.price !== '' && !isNaN(num) && num > 0) it.manualPrice = num
    setItems(prev => dedupeItems([...prev, it]))
    setPre({ name: '', listNo: '', type: it.type, rarity: '', img: '', price: '' })
  }

  // 編集中の定義: 開いた時点の中身から変更がある（追加・削除・並べ替え・取り込み）
  const dirty = useMemo(() => JSON.stringify(items) !== JSON.stringify(initialItems), [items, initialItems])
  useImperativeHandle(ref, () => ({
    isDirty: () => dirty,
    // DBに保存だけ行う（onSavedの再適用は走らせない）。ジャンル切替時の保存用
    saveOnly: async () => { await saveCardListItems(list.id, dedupeItems(items)) },
    // 事前登録セクションを開く（パネルの「＋事前登録」ボタン用）
    openPreRegister: () => setPreOpen(true),
  }))

  // リスト項目が今日のデータ上で指す実カードidの集合（= 登録済みカード）
  const resolved = useMemo(() => resolveItems(items, allCards), [items, allCards])
  const registeredIds = useMemo(() => new Set(resolved.filter(Boolean).map(c => c.id)), [resolved])

  // 選択中のうち、まだこのリストに無いカード（実カードid基準・重複除去）
  const pendingFromSelection = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const c of cards || []) {
      if (!c || c.id == null || registeredIds.has(c.id) || seen.has(c.id)) continue
      seen.add(c.id)
      out.push(c)
    }
    return out
  }, [cards, registeredIds])

  const importSelection = () => {
    setItems(prev => dedupeItems([...prev, ...cardsToItems(pendingFromSelection)]))
  }

  const candidates = useMemo(() => {
    if (!search.trim()) return []
    const q = search.toLowerCase()
    return allCards
      .filter(c => !registeredIds.has(c.id) &&
        (String(c.name).toLowerCase().includes(q) || String(c.listNo || '').toLowerCase().includes(q)))
      .slice(0, 25)
  }, [search, allCards, registeredIds])

  const add = (c) => setItems(prev => dedupeItems([...prev, ...cardsToItems([c])]))
  const removeAt = (i) => { setItems(prev => prev.filter((_, idx) => idx !== i)); setChecked(new Set()) }
  const move = (i, dir) => {
    setItems(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const a = [...prev]
      ;[a[i], a[j]] = [a[j], a[i]]
      return a
    })
    setChecked(new Set())
  }

  // ドラッグ並べ替え（複数チェックでまとめて移動）
  const [checked, setChecked] = useState(() => new Set())   // チェック済みインデックス
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const toggleChecked = (i) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })
  const onDrop = (targetIdx) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); setOverIdx(null); return }
    const movingSet = checked.has(dragIdx) && checked.size > 0 ? checked : new Set([dragIdx])
    setItems(prev => moveBlockByIndex(prev, movingSet, targetIdx))
    setChecked(new Set())   // 移動後はインデックスが変わるためチェック解除
    setDragIdx(null)
    setOverIdx(null)
  }
  const isDragging = (i) => dragIdx !== null && (i === dragIdx || (checked.has(dragIdx) && checked.has(i)))

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const cleaned = dedupeItems(items)
    try { await saveCardListItems(list.id, cleaned); onSaved(cleaned) }
    catch (e) { setSaveError(`保存に失敗しました: ${e.message}（通信状況を確認して再度お試しください）`) }
    finally { setSaving(false) }
  }

  return (
    <div className="bg-white border border-[#1e3a5f]/40 rounded-lg p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[#1e3a5f]">「{list.name}」を編集（{items.length}件）</span>
        <button onClick={onClose} className="text-[10px] text-[#8c95a4] hover:text-[#1e3a5f] cursor-pointer">閉じる</button>
      </div>

      {/* 選択中の未登録カードを取り込むバー */}
      {pendingFromSelection.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          <span className="text-[10px] text-amber-700 flex-1 leading-snug">選択中に、このリスト未登録のカードが {pendingFromSelection.length}件あります</span>
          <button onClick={importSelection} className="text-[10px] px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white cursor-pointer whitespace-nowrap flex-shrink-0">取り込む</button>
        </div>
      )}

      {/* 登録済みカード（ドラッグ並べ替え・☑でまとめて移動・削除） */}
      <div className="text-[9px] text-[#8c95a4] flex items-center justify-between">
        <span>ドラッグ / ▲▼で並べ替え。☑を付けてドラッグするとまとめて移動</span>
        {checked.size > 0 && (
          <button onClick={() => setChecked(new Set())} className="text-[9px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer">
            {checked.size}件チェック解除
          </button>
        )}
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#e0e4ea]">
        {items.length === 0 && (
          <p className="text-[10px] text-[#8c95a4] text-center py-3">まだカードがありません。下で検索して追加してください。</p>
        )}
        {items.map((it, i) => (
          <div
            key={`${it.listNo}|${it.type}|${it.name}|${it.rarity || ''}|${i}`}
            draggable
            onDragStart={e => { setDragIdx(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)) }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIdx(i) }}
            onDrop={e => { e.preventDefault(); onDrop(i) }}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null) }}
            className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] cursor-grab active:cursor-grabbing transition-all ${
              checked.has(i) ? 'bg-amber-50' : 'bg-white'
            } ${isDragging(i) ? 'opacity-30 scale-95' : ''} ${overIdx === i && dragIdx !== i ? 'ring-2 ring-[#1e3a5f]' : 'border border-[#e0e4ea]'}`}
          >
            <input
              type="checkbox"
              checked={checked.has(i)}
              onChange={() => toggleChecked(i)}
              onClick={e => e.stopPropagation()}
              className="cursor-pointer flex-shrink-0"
              title="チェックした行をドラッグでまとめて移動"
            />
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-[10px] leading-none text-[#5a6577] hover:text-white hover:bg-[#1e3a5f] disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer px-1 rounded bg-[#eef1f6] border border-[#d0d5dd]">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="text-[10px] leading-none text-[#5a6577] hover:text-white hover:bg-[#1e3a5f] disabled:opacity-20 disabled:hover:bg-transparent cursor-pointer px-1 rounded bg-[#eef1f6] border border-[#d0d5dd]">▼</button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-[#1e3a5f]">{it.name}</div>
              <div className="text-[9px] text-[#8c95a4]">
                {it.listNo || '—'} / {it.type}{it.rarity ? ` / ${it.rarity}` : ''}
                {!resolved[i] && <span className="text-red-400 ml-1">（今日の在庫なし）</span>}
              </div>
            </div>
            <button onClick={() => removeAt(i)} className="text-red-500 hover:text-red-700 cursor-pointer px-1.5 py-1 text-sm">×</button>
          </div>
        ))}
      </div>

      {/* 検索して追加 */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="カード名 / 番号で検索して追加..."
        className="w-full text-xs px-2 py-1.5 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
      />
      {candidates.length > 0 && (
        <div className="max-h-44 overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#e0e4ea]">
          {candidates.map(c => (
            <div key={c.id} onClick={() => add(c)}
              className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[11px] hover:bg-[#eef1f6] cursor-pointer">
              <div className="w-6 h-8 bg-[#dfe3ea] rounded overflow-hidden flex-shrink-0">
                {c.imageUrl ? <img src={c.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="truncate text-[#5a6577]">{c.name}</div>
                <div className="text-[9px] text-[#8c95a4]">{c.listNo || '—'} / {c.type}{c.rarity ? ` / ${c.rarity}` : ''} / ¥{(c.price || 0).toLocaleString()}</div>
              </div>
              <span className="text-[#1e3a5f] text-sm">＋</span>
            </div>
          ))}
        </div>
      )}
      {search.trim() && candidates.length === 0 && (
        <p className="text-[10px] text-[#8c95a4]">該当なし。Excelにまだ無いカードは、下の「事前登録」から追加できます。</p>
      )}

      {/* Excelにまだ無いカードの事前登録 */}
      <div className="border border-[#cdd8e6] rounded">
        <button
          type="button"
          onClick={() => setPreOpen(v => !v)}
          className="w-full flex items-center justify-between text-[11px] text-[#1e3a5f] px-2 py-1.5 cursor-pointer hover:bg-[#f0f4f8]"
        >
          <span>＋ Excelに無いカードを事前登録</span>
          <span className="text-[#8c95a4]">{preOpen ? '▲' : '▼'}</span>
        </button>
        {preOpen && (
          <div className="px-2 pb-2 space-y-1.5 border-t border-[#e0e4ea] pt-1.5">
            <p className="text-[9px] text-[#8c95a4] leading-snug">
              発注が来たら自動で実データに切り替わります。カード名・型番はExcelの表記と一致させてください（一致しないと別カード扱いになります）。
            </p>
            <div className="flex gap-1.5">
              <input value={pre.name} onChange={e => setPreField('name', e.target.value)} placeholder="カード名（必須）"
                className="flex-1 text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
            </div>
            <div className="flex gap-1.5">
              <input value={pre.listNo} onChange={e => setPreField('listNo', e.target.value)} placeholder="型番（例: 114/100）"
                className="flex-1 text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
              <input value={pre.type} onChange={e => setPreField('type', e.target.value)} placeholder="種別" list="pre-type-options"
                className="w-20 text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
              <datalist id="pre-type-options">
                {typeOptions.map(t => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div className="flex gap-1.5">
              {genre === 'yugioh' && (
                <input value={pre.rarity} onChange={e => setPreField('rarity', e.target.value)} placeholder="レアリティ（例: 20thシークレット）"
                  className="flex-1 text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
              )}
              <input value={pre.price} onChange={e => setPreField('price', e.target.value)} placeholder="表示価格（任意）"
                className="w-28 text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
            </div>
            <input value={pre.img} onChange={e => setPreField('img', e.target.value)} placeholder="画像URL（任意・https://...）"
              className="w-full text-[11px] px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
            <button
              type="button"
              onClick={addPreRegistered}
              disabled={!pre.name.trim()}
              className="w-full text-[11px] px-2 py-1 rounded bg-[#3d7c4f] hover:bg-[#346b44] text-white cursor-pointer disabled:opacity-40"
            >この内容でリストに追加</button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{saveError}</div>
      )}
      <button onClick={save} disabled={saving}
        className="w-full text-xs px-2 py-1.5 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer disabled:opacity-50">
        {saving ? '保存中...' : 'この内容で保存'}
      </button>
    </div>
  )
})

export default CardListEditor
