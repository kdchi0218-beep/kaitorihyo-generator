import { useState, useMemo, useRef, useCallback } from 'react'

export default function CardSelector({ allCards, cards, setCards, setAllCards }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priceFilter, setPriceFilter] = useState('withPrice')
  const [sortBy, setSortBy] = useState('priceDesc')
  const [detailCard, setDetailCard] = useState(null)
  const lastClickedIndex = useRef(null)

  // ドラッグ
  const [grabbedIndex, setGrabbedIndex] = useState(null)
  const [overIndex, setOverIndex] = useState(null)

  // インライン編集
  const [editingId, setEditingId] = useState(null)
  const [editField, setEditField] = useState(null) // 'name' | 'price'
  const [editValue, setEditValue] = useState('')

  const categories = useMemo(() => {
    const tags = [...new Set(allCards.map(c => c.tag))]
    return tags.sort()
  }, [allCards])

  const boxNames = useMemo(() => [...new Set(allCards.map(c => c.boxName).filter(Boolean))].sort(), [allCards])
  const rarities = useMemo(() => [...new Set(allCards.map(c => c.rarity).filter(Boolean))].sort(), [allCards])

  // ソートはselectedのみ（cards）に適用して表示順を変える
  const applySort = (list, sort) => {
    const typeOrder = { 'PSA10': 0, '素体': 1 }
    switch (sort) {
      case 'priceDesc': return [...list].sort((a, b) => b.price - a.price)
      case 'priceAsc': return [...list].sort((a, b) => a.price - b.price)
      case 'nameAsc': return [...list].sort((a, b) => a.name.localeCompare(b.name))
      case 'typeAsc': return [...list].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99) || b.price - a.price)
      case 'rarityAsc': return [...list].sort((a, b) => (a.rarity || '').localeCompare(b.rarity || '') || b.price - a.price)
      case 'boxAsc': return [...list].sort((a, b) => (a.boxName || '').localeCompare(b.boxName || '') || b.price - a.price)
      case 'tagAsc': return [...list].sort((a, b) => (a.tag || '').localeCompare(b.tag || '') || b.price - a.price)
      default: return list
    }
  }

  // 未選択カードをフィルタ・ソートして表示
  const selectedIds = new Set(cards.map(c => c.id))

  const unselectedCards = useMemo(() => {
    let result = allCards.filter(c => !selectedIds.has(c.id))
    if (categoryFilter !== 'all') result = result.filter(c => c.tag === categoryFilter)
    if (priceFilter === 'withPrice') result = result.filter(c => c.price > 0)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.listNo.toLowerCase().includes(q))
    }
    return applySort(result, sortBy)
  }, [allCards, selectedIds, categoryFilter, priceFilter, search, sortBy])

  const toggleCard = useCallback((card, index, shiftKey) => {
    if (selectedIds.has(card.id)) {
      setCards(cards.filter(c => c.id !== card.id))
    } else {
      setCards([...cards, card])
    }
  }, [cards, setCards, selectedIds])

  const selectAll = () => {
    setCards([...cards, ...unselectedCards.filter(c => !selectedIds.has(c.id))])
  }

  const clearAll = () => setCards([])

  // 並び替え
  const handleSort = (sort) => {
    setSortBy(sort)
    setCards(applySort(cards, sort))
  }

  const moveCard = (fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= cards.length) return
    const newCards = [...cards]
    const [moved] = newCards.splice(fromIndex, 1)
    newCards.splice(toIndex, 0, moved)
    setCards(newCards)
  }

  const handleDragStart = (e, index) => {
    setGrabbedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
  const handleDragOver = (e, index) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIndex(index) }
  const handleDrop = (e, index) => {
    e.preventDefault()
    if (grabbedIndex !== null && grabbedIndex !== index) moveCard(grabbedIndex, index)
    setGrabbedIndex(null)
    setOverIndex(null)
  }
  const handleDragEnd = () => { setGrabbedIndex(null); setOverIndex(null) }

  // インライン編集
  const startEdit = (card, field) => {
    setEditingId(card.id)
    setEditField(field)
    setEditValue(field === 'price' ? String(card.price) : card.name)
  }

  const commitEdit = () => {
    if (!editingId) return
    const update = (list) => list.map(c => {
      if (c.id !== editingId) return c
      if (editField === 'name') return { ...c, name: editValue.trim() || c.name }
      if (editField === 'price') {
        const num = Number(editValue.replace(/[¥￥,、]/g, ''))
        return { ...c, price: isNaN(num) ? c.price : num }
      }
      return c
    })
    setCards(update(cards))
    setAllCards(update(allCards))
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
        <select value={sortBy} onChange={e => handleSort(e.target.value)} className="text-xs">
          <option value="priceDesc">価格 高い順</option>
          <option value="priceAsc">価格 安い順</option>
          <option value="nameAsc">名前順</option>
          <option value="typeAsc">種別順</option>
          <option value="tagAsc">カテゴリ順</option>
          {boxNames.length > 0 && <option value="boxAsc">ボックス順</option>}
          {rarities.length > 0 && <option value="rarityAsc">レアリティ順</option>}
        </select>
      </div>

      {/* 一括操作 */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={selectAll} className="text-xs px-2 py-1 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer">全選択</button>
        <button onClick={clearAll} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer">全解除</button>
        <span className="text-xs text-[#8c95a4] ml-auto self-center">選択{cards.length}枚</span>
      </div>

      {/* 選択済みカード（並び替え・編集可能） */}
      {cards.length > 0 && (
        <>
          <div className="text-[10px] text-[#8c95a4] flex justify-between">
            <span>選択済み — ドラッグ / ↑↓で並び替え / ダブルクリックで編集</span>
          </div>
          <div className="max-h-60 overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#1e3a5f]/20">
            {cards.map((card, index) => (
              <div
                key={card.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 px-1.5 py-1 rounded text-xs bg-white hover:bg-[#eef1f6] cursor-grab active:cursor-grabbing transition-all ${
                  grabbedIndex === index ? 'opacity-30 scale-95' : ''
                } ${overIndex === index && grabbedIndex !== index ? 'ring-2 ring-[#1e3a5f]' : 'border border-[#e0e4ea]'}`}
              >
                {/* ドラッグハンドル + 上下 */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <div className="text-[#8c95a4] select-none">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="2"/><circle cx="15" cy="5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="9" cy="19" r="2"/><circle cx="15" cy="19" r="2"/></svg>
                  </div>
                  <div className="flex flex-col">
                    <button onClick={() => moveCard(index, index - 1)} disabled={index === 0} className="text-[#8c95a4] hover:text-[#1e3a5f] disabled:opacity-20 cursor-pointer leading-none text-[8px]">▲</button>
                    <button onClick={() => moveCard(index, index + 1)} disabled={index === cards.length - 1} className="text-[#8c95a4] hover:text-[#1e3a5f] disabled:opacity-20 cursor-pointer leading-none text-[8px]">▼</button>
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
                  <div className="font-mono text-right whitespace-nowrap text-[#b8860b] cursor-text" onDoubleClick={() => startEdit(card, 'price')} title="ダブルクリックで編集">
                    {card.price > 0 ? `¥${card.price.toLocaleString()}` : '-'}
                  </div>
                )}
                {/* 削除 */}
                <button onClick={() => setCards(cards.filter(c => c.id !== card.id))} className="text-[#8c95a4] hover:text-red-500 cursor-pointer flex-shrink-0">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 未選択カード */}
      {unselectedCards.length > 0 && (
        <>
          <div className="text-[10px] text-[#8c95a4]">未選択 — クリックで追加（{unselectedCards.length}件）</div>
          <div className="max-h-48 overflow-y-auto space-y-0.5 bg-[#f8f9fb] rounded p-1 border border-[#e0e4ea]">
            {unselectedCards.map((card) => (
              <div
                key={card.id}
                onClick={() => setCards([...cards, card])}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-[#eef1f6] border border-transparent cursor-pointer"
              >
                <div className="w-7 h-10 rounded overflow-hidden bg-[#dfe3ea] flex-shrink-0">
                  {card.imageUrl ? <img src={card.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full flex items-center justify-center text-[#8c95a4] text-[7px]">--</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[#5a6577]">{card.name}</div>
                  <div className="text-[#8c95a4] text-[10px]">{card.listNo} / {card.type}</div>
                </div>
                <div className="font-mono text-right whitespace-nowrap text-[#5a6577]">
                  {card.price > 0 ? `¥${card.price.toLocaleString()}` : '-'}
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
