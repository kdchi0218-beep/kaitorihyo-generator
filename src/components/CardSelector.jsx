import { useState, useMemo } from 'react'
import { isCardListed, tokyoDateKey } from '../lib/cardKeys.js'
import { usesDailyPreviousPrice } from '../lib/genres.js'
import { moveBlockById } from '../lib/reorder.js'

const createPriceEditToken = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function CardSelector({ allCards, cards, setCards, setAllCards, listedKeys = null, genre = '' }) {
  const [tab, setTab] = useState('unselected')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')   // 種別(PSA10/BOX/PSA9等)の粗い絞り込み
  const [priceFilter, setPriceFilter] = useState('withPrice')
  const [unlistedOnly, setUnlistedOnly] = useState(false)

  // どの定番リストにも入っていないカードか（新着カードの発見用）
  const isUnlisted = (c) => listedKeys && !isCardListed(c, listedKeys)
  const unlistedCount = useMemo(
    () => (listedKeys ? allCards.filter(isUnlisted).length : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, listedKeys]
  )
  const [sortBy, setSortBy] = useState('priceDesc')
  const [sortBy2, setSortBy2] = useState('none')
  const [detailCard, setDetailCard] = useState(null)

  // ドラッグ（id基準・複数チェックでまとめて移動可）
  const [grabbedId, setGrabbedId] = useState(null)
  const [overId, setOverId] = useState(null)
  // 複数選択チェック（選択中タブ=まとめて移動 / 未選択タブ=まとめて追加）
  const [selChecked, setSelChecked] = useState(() => new Set())
  const [unselChecked, setUnselChecked] = useState(() => new Set())
  const toggleSetId = (setter) => (id) => setter(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const toggleSelChecked = toggleSetId(setSelChecked)
  const toggleUnselChecked = toggleSetId(setUnselChecked)

  // インライン編集
  const [editingId, setEditingId] = useState(null)
  const [editField, setEditField] = useState(null) // 'name' | 'price'
  const [editValue, setEditValue] = useState('')

  const categories = useMemo(() => {
    const tags = [...new Set(allCards.map(c => c.tag))]
    return tags.sort()
  }, [allCards])

  // 種別(PSA10/PSA9/BOX/素体等)の粗い区分。PSA10→PSA9→その他→BOX/素体 の順で並べる
  const types = useMemo(() => {
    const order = { 'PSA10': 0, 'PSA9': 1, 'PSA8': 2, 'BOX': 8, '素体': 9 }
    return [...new Set(allCards.map(c => c.type).filter(Boolean))]
      .sort((a, b) => (order[a] ?? 5) - (order[b] ?? 5) || String(a).localeCompare(String(b)))
  }, [allCards])

  const boxNames = useMemo(() => [...new Set(allCards.map(c => c.boxName).filter(Boolean))].sort(), [allCards])
  const rarities = useMemo(() => [...new Set(allCards.map(c => c.rarity).filter(Boolean))].sort(), [allCards])

  // ソートはselectedのみ（cards）に適用して表示順を変える
  const applySort = (list, sort, sort2) => {
    // C列「種別」の並び順（PSA10→PSA9→PSA8→その他→BOX→素体）。typeフィルタの並びと揃える
    const typeOrder = { 'PSA10': 0, 'PSA9': 1, 'PSA8': 2, 'BOX': 8, '素体': 9 }

    const compareByKey = (key, a, b) => {
      switch (key) {
        case 'priceDesc': return (b.price ?? 0) - (a.price ?? 0)
        case 'priceAsc': return (a.price ?? 0) - (b.price ?? 0)
        case 'nameAsc': return String(a.name ?? '').localeCompare(String(b.name ?? ''))
        case 'typeAsc': return (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99)
        case 'tagAsc': return String(a.tag ?? '').localeCompare(String(b.tag ?? ''))
        case 'boxAsc': return String(a.boxName ?? '').localeCompare(String(b.boxName ?? ''))
        case 'rarityAsc': return String(a.rarity ?? '').localeCompare(String(b.rarity ?? ''))
        default: return 0
      }
    }

    return [...list].sort((a, b) => {
      const primary = compareByKey(sort, a, b)
      if (primary !== 0) return primary

      // 第2ソートが明示指定されていればそれを使う
      if (sort2 && sort2 !== 'none') {
        return compareByKey(sort2, a, b)
      }

      // 既存の暗黙タイブレーク維持（後方互換）:
      //   typeAsc/rarityAsc/boxAsc/tagAsc は同キー内で価格降順
      if (sort === 'typeAsc' || sort === 'rarityAsc' || sort === 'boxAsc' || sort === 'tagAsc') {
        return (b.price ?? 0) - (a.price ?? 0)
      }
      return 0
    })
  }

  // 未選択カードをフィルタ・ソートして表示
  const selectedIds = new Set(cards.map(c => c.id))

  const unselectedCards = useMemo(() => {
    let result = allCards.filter(c => !selectedIds.has(c.id))
    if (unlistedOnly && listedKeys) result = result.filter(isUnlisted)
    if (typeFilter !== 'all') result = result.filter(c => c.type === typeFilter)
    if (categoryFilter !== 'all') result = result.filter(c => c.tag === categoryFilter)
    if (priceFilter === 'withPrice') result = result.filter(c => c.price > 0)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.listNo.toLowerCase().includes(q))
    }
    return applySort(result, sortBy, sortBy2)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCards, selectedIds, typeFilter, categoryFilter, priceFilter, search, sortBy, sortBy2, unlistedOnly, listedKeys])

  // 全て関数型更新(prev =>)で書く: 連続クリック・編集中の並べ替え等で
  // 古いスナップショットが最新状態を上書きする巻き戻りを防ぐ
  const selectAll = () => {
    const toAdd = unselectedCards
    setCards(prev => [...prev, ...toAdd.filter(c => !prev.some(p => p.id === c.id))])
  }

  const clearAll = () => setCards([])

  // 並び替え
  const handleSort = (sort) => {
    setSortBy(sort)
    setCards(prev => applySort(prev, sort, sortBy2))
  }

  const handleSort2 = (sort2) => {
    setSortBy2(sort2)
    setCards(prev => applySort(prev, sortBy, sort2))
  }

  const moveCard = (fromIndex, toIndex) => {
    setCards(prev => {
      if (toIndex < 0 || toIndex >= prev.length || fromIndex < 0 || fromIndex >= prev.length) return prev
      const newCards = [...prev]
      const [moved] = newCards.splice(fromIndex, 1)
      newCards.splice(toIndex, 0, moved)
      return newCards
    })
  }

  const handleDragStart = (e, id) => {
    setGrabbedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(id))
  }
  const handleDragOver = (e, id) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverId(id) }
  const handleDrop = (e, targetId) => {
    e.preventDefault()
    if (grabbedId !== null && grabbedId !== targetId) {
      // 掴んだカードがチェック済みなら、チェックした全カードをブロックでまとめて移動
      const movingIds = selChecked.has(grabbedId) && selChecked.size > 0 ? [...selChecked] : [grabbedId]
      setCards(prev => moveBlockById(prev, movingIds, targetId))
    }
    setGrabbedId(null)
    setOverId(null)
  }
  const handleDragEnd = () => { setGrabbedId(null); setOverId(null) }
  // ドラッグ中のハイライト判定（グループ移動時はチェック済み全行を薄く）
  const isGrabbed = (id) => grabbedId !== null && (id === grabbedId || (selChecked.has(grabbedId) && selChecked.has(id)))

  // インライン編集
  const startEdit = (card, field) => {
    setEditingId(card.id)
    setEditField(field)
    setEditValue(field === 'price' ? (card.priceText || String(card.price)) : card.name)
  }

  const commitEdit = () => {
    if (!editingId) return
    // updater の再実行（Strict Mode）でも同じ編集を同一トークンとして扱う。
    const priceEditToken = editField === 'price' ? createPriceEditToken() : null
    const priceEditEditedOn = editField === 'price' && usesDailyPreviousPrice(genre) ? tokyoDateKey() : null
    const update = (list) => list.map(c => {
      if (c.id !== editingId) return c
      if (editField === 'name') return { ...c, name: editValue.trim() || c.name }
      if (editField === 'price') {
        const cleaned = editValue.replace(/[¥￥,、]/g, '').trim()
        const num = Number(cleaned)
        // 空欄で確定しても既存価格を消さず、保存待ち状態も作らない。
        if (cleaned === '') return c
        // リスト由来の発注なしカードだけをDBへの自動書戻し対象にする。
        const pending = c.missing && c.fromListId ? {
          priceEditToken,
          ...(priceEditEditedOn ? { priceEditEditedOn } : {}),
        } : {}
        // 数値ならprice（テキスト上書き解除）、文字なら priceText に保持
        // 手動編集したら「前回価格」マークを外し、価格再計算でも上書きされないようにする
        if (cleaned !== '' && !isNaN(num)) {
          return { ...c, price: num, priceText: null, priceIsLast: false, priceManual: true, ...pending }
        }
        return { ...c, priceText: editValue.trim() || null, priceIsLast: false, priceManual: false, ...pending }
      }
      return c
    })
    setCards(prev => update(prev))
    setAllCards(prev => update(prev))
    setEditingId(null)
    setEditField(null)
  }

  const cancelEdit = () => { setEditingId(null); setEditField(null) }

  if (allCards.length === 0) {
    return <p className="text-xs text-[#8c95a4]">データを読み込んでください</p>
  }

  return (
    <div className="space-y-2">
      {/* 詳細モーダル */}
      {detailCard && (
        <div className="bg-[#f8f9fb] border border-[#e0e4ea] rounded-lg p-3 relative">
          <button onClick={() => setDetailCard(null)} className="absolute top-2 right-2 text-[#8c95a4] hover:text-[#1e3a5f] cursor-pointer text-sm">x</button>
          <div className="flex gap-3">
            <div className="w-20 h-28 rounded overflow-hidden bg-[#dfe3ea] flex-shrink-0">
              {detailCard.imageUrl ? <img src={detailCard.imageUrl} alt="" className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-[#8c95a4] text-[10px]">NO IMAGE</div>}
            </div>
            <div className="flex-1 text-xs space-y-1">
              <div className="font-bold text-[#1e3a5f] text-sm">{detailCard.name}</div>
              <div className="text-[#5a6577]">番号: {detailCard.listNo}</div>
              <div className="text-[#5a6577]">種別: {detailCard.type}</div>
              <div className="text-[#5a6577]">カテゴリ: {detailCard.tag}</div>
              {detailCard.rarity && <div className="text-[#5a6577]">レアリティ: {detailCard.rarity}</div>}
              {detailCard.boxName && <div className="text-[#5a6577]">ボックス: {detailCard.boxName}</div>}
              <div className="font-bold text-[#b8860b] text-base">{detailCard.price > 0 ? `¥${detailCard.price.toLocaleString()}` : '価格未設定'}</div>
            </div>
          </div>
        </div>
      )}

      {/* フィルタ */}
      <div className="flex gap-2">
        {/* 種別(PSA10/BOX等)の粗い絞り込み。ジャンルに2種別以上ある時だけ表示 */}
        {types.length > 1 && (
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="text-xs">
            <option value="all">全種別</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="flex-1 text-xs">
          <option value="all">全カテゴリ</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)} className="text-xs">
          <option value="withPrice">価格あり</option>
          <option value="all">全件</option>
        </select>
      </div>
      <div className="flex gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="カード名検索..." className="flex-1 text-xs" />
      </div>
      <div className="flex gap-2">
        <select value={sortBy} onChange={e => handleSort(e.target.value)} className="flex-1 text-xs">
          <option value="priceDesc">価格 高い順</option>
          <option value="priceAsc">価格 安い順</option>
          <option value="nameAsc">名前順</option>
          <option value="typeAsc">種別順(PSA10/BOX)</option>
          <option value="tagAsc">カテゴリ順</option>
          {boxNames.length > 0 && <option value="boxAsc">ボックス順</option>}
          {rarities.length > 0 && <option value="rarityAsc">レアリティ順</option>}
        </select>
        <select value={sortBy2} onChange={e => handleSort2(e.target.value)} className="flex-1 text-xs">
          <option value="none">第2ソートなし</option>
          <option value="priceDesc">→ 価格 高い順</option>
          <option value="priceAsc">→ 価格 安い順</option>
          <option value="nameAsc">→ 名前順</option>
          <option value="typeAsc">→ 種別順(PSA10/BOX)</option>
          <option value="tagAsc">→ カテゴリ順</option>
          {boxNames.length > 0 && <option value="boxAsc">→ ボックス順</option>}
          {rarities.length > 0 && <option value="rarityAsc">→ レアリティ順</option>}
        </select>
      </div>

      {/* 一括操作 */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={selectAll} className="text-xs px-2 py-1 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer">全選択</button>
        <button onClick={clearAll} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer">全解除</button>
      </div>

      {/* タブ: 選択中 / 未選択 */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab('selected')}
          className={`flex-1 text-xs px-2 py-1.5 rounded cursor-pointer border ${tab === 'selected' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-[#5a6577] border-[#e0e4ea] hover:border-[#1e3a5f]'}`}
        >
          選択中 {cards.length}
        </button>
        <button
          onClick={() => setTab('unselected')}
          className={`flex-1 text-xs px-2 py-1.5 rounded cursor-pointer border ${tab === 'unselected' ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-[#5a6577] border-[#e0e4ea] hover:border-[#1e3a5f]'}`}
        >
          未選択 {unselectedCards.length}
        </button>
      </div>

      {/* リスト未登録フィルタ（新着カードの発見用）— タブ直下 */}
      {listedKeys && (
        <label className={`flex items-center gap-1.5 text-[10px] cursor-pointer select-none rounded px-1.5 py-1 border ${unlistedOnly ? 'bg-amber-50 border-amber-300 text-amber-800' : 'bg-[#f8f9fb] border-[#e0e4ea] text-[#5a6577]'}`}>
        <input type="checkbox" checked={unlistedOnly} onChange={e => setUnlistedOnly(e.target.checked)} className="cursor-pointer" />
          どのリストにも入っていないカードのみ表示
          <span className={`ml-auto font-semibold ${unlistedCount > 0 ? 'text-amber-700' : 'text-[#8c95a4]'}`}>{unlistedCount}件</span>
        </label>
      )}

      {/* 選択済みカード（並び替え・編集可能） */}
      {tab === 'selected' && cards.length === 0 && (
        <p className="text-xs text-[#8c95a4] py-4 text-center">選択中のカードはありません</p>
      )}
      {tab === 'selected' && cards.length > 0 && (
        <>
          <div className="text-[10px] text-[#8c95a4] flex items-center justify-between gap-2">
            <span>ドラッグ / ↑↓で並び替え / ダブルクリックで編集 / ☑で複数まとめて移動</span>
            {selChecked.size > 0 && (
              <span className="flex items-center gap-1 flex-shrink-0 text-amber-700 font-semibold">
                {[...selChecked].filter(id => cards.some(c => c.id === id)).length}枚チェック中
                <button onClick={() => setSelChecked(new Set())} className="text-[10px] px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 cursor-pointer">解除</button>
              </span>
            )}
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#1e3a5f]/20">
            {cards.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, card.id)}
                onDragOver={(e) => handleDragOver(e, card.id)}
                onDrop={(e) => handleDrop(e, card.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs hover:bg-[#eef1f6] cursor-grab active:cursor-grabbing transition-all ${
                  selChecked.has(card.id) ? 'bg-amber-50' : 'bg-white'
                } ${isGrabbed(card.id) ? 'opacity-30 scale-95' : ''} ${overId === card.id && grabbedId !== card.id ? 'ring-2 ring-[#1e3a5f]' : 'border border-[#e0e4ea]'}`}
              >
                {/* 複数選択チェック */}
                <input
                  type="checkbox"
                  checked={selChecked.has(card.id)}
                  onChange={() => toggleSelChecked(card.id)}
                  onClick={e => e.stopPropagation()}
                  className="cursor-pointer flex-shrink-0"
                  title="チェックした行をドラッグでまとめて移動"
                />
                {/* ドラッグハンドル + 上下 */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <div className="text-[#8c95a4] select-none">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveCard(index, index - 1)} disabled={index === 0} className="text-[#5a6577] hover:text-white hover:bg-[#1e3a5f] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#5a6577] cursor-pointer leading-none text-xs px-1.5 py-1 rounded bg-[#eef1f6] border border-[#d0d5dd]">▲</button>
                    <button onClick={() => moveCard(index, index + 1)} disabled={index === cards.length - 1} className="text-[#5a6577] hover:text-white hover:bg-[#1e3a5f] disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#5a6577] cursor-pointer leading-none text-xs px-1.5 py-1 rounded bg-[#eef1f6] border border-[#d0d5dd]">▼</button>
                  </div>
                </div>
                {/* サムネ */}
                <div className="w-7 h-10 rounded overflow-hidden bg-[#dfe3ea] flex-shrink-0 cursor-pointer" onClick={() => setDetailCard(card)}>
                  {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-[#8c95a4] text-[7px]">--</div>}
                </div>
                {/* 名前（ダブルクリック編集） */}
                <div className="flex-1 min-w-0">
                  {editingId === card.id && editField === 'name' ? (
                    <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                      onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                      autoFocus className="w-full text-xs px-1 py-0.5 border border-[#1e3a5f] rounded outline-none" />
                  ) : (
                    <div className="truncate text-[#1e3a5f] cursor-text" onDoubleClick={() => startEdit(card, 'name')} title="ダブルクリックで編集">{card.name}</div>
                  )}
                  <div className="text-[#8c95a4] text-[10px]">{card.type}{card.rarity ? ` / ${card.rarity}` : ''}</div>
                </div>
                {/* 価格（ダブルクリック編集） */}
                {editingId === card.id && editField === 'price' ? (
                  <input type="text" value={editValue} onChange={e => setEditValue(e.target.value)}
                    onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                    autoFocus className="w-20 text-xs px-1 py-0.5 border border-[#1e3a5f] rounded outline-none text-right" />
                ) : (
                  <div className="font-mono text-right whitespace-nowrap text-[#b8860b] cursor-text flex items-center gap-1" onDoubleClick={() => startEdit(card, 'price')}
                    title={card.priceIsLast ? '前回読み込み時の価格です。ダブルクリックで手動修正できます' : 'ダブルクリックで編集（数値=価格 / 文字=要相談 等）'}>
                    {card.priceIsLast && (
                      <span className="text-[8px] leading-none text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 py-0.5 flex-shrink-0">前回</span>
                    )}
                    <span className={card.priceIsLast ? 'text-amber-600' : ''}>
                      {card.priceText ? card.priceText : (card.price > 0 ? `¥${card.price.toLocaleString()}` : '-')}
                    </span>
                  </div>
                )}
                {/* 削除 */}
                <button onClick={() => setCards(prev => prev.filter(c => c.id !== card.id))} className="text-[#8c95a4] hover:text-red-500 cursor-pointer flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 未選択カード */}
      {tab === 'unselected' && (
        <>
          <div className="text-[10px] text-[#8c95a4] flex items-center justify-between gap-2">
            <span>クリックで追加 / ☑でまとめて追加（{unselectedCards.length}件）</span>
            {unselChecked.size > 0 && (
              <button
                onClick={() => {
                  const toAdd = unselectedCards.filter(c => unselChecked.has(c.id))
                  setCards(prev => [...prev, ...toAdd.filter(c => !prev.some(p => p.id === c.id))])
                  setUnselChecked(new Set())
                }}
                className="text-[10px] px-2 py-0.5 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer flex-shrink-0"
              >チェックした{[...unselChecked].filter(id => unselectedCards.some(c => c.id === id)).length}枚を追加</button>
            )}
          </div>
          <div className="max-h-[calc(100vh-300px)] overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#e0e4ea]">
            {unselectedCards.map((card) => (
              <div
                key={card.id}
                onClick={() => setCards(prev => prev.some(c => c.id === card.id) ? prev : [...prev, card])}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#eef1f6] border cursor-pointer ${unselChecked.has(card.id) ? 'bg-amber-50 border-amber-200' : 'border-transparent'}`}
              >
                <input
                  type="checkbox"
                  checked={unselChecked.has(card.id)}
                  onChange={() => toggleUnselChecked(card.id)}
                  onClick={e => e.stopPropagation()}
                  className="cursor-pointer flex-shrink-0"
                  title="チェックして上の「まとめて追加」で一括追加"
                />
                <div className="w-7 h-10 rounded overflow-hidden bg-[#dfe3ea] flex-shrink-0">
                  {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-[#8c95a4] text-[7px]">--</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[#5a6577] flex items-center gap-1">
                    <span className="truncate">{card.name}</span>
                    {isUnlisted(card) && (
                      <span className="text-[8px] leading-none text-amber-700 bg-amber-50 border border-amber-300 rounded px-1 py-0.5 flex-shrink-0" title="どの定番リストにも入っていないカード">リスト外</span>
                    )}
                  </div>
                  <div className="text-[#8c95a4] text-[10px]">{card.listNo} / {card.type}</div>
                </div>
                <div className="font-mono text-right whitespace-nowrap text-[#5a6577]">
                  {card.priceText ? card.priceText : (card.price > 0 ? `¥${card.price.toLocaleString()}` : '-')}
                </div>
                <div className="w-5 h-5 rounded border border-[#d0d5dd] hover:border-[#1e3a5f] flex items-center justify-center flex-shrink-0 text-[#1e3a5f] text-[10px]">+</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
