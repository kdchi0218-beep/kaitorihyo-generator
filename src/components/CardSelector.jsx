import { useState, useMemo } from 'react'

export default function CardSelector({ allCards, cards, setCards }) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [priceFilter, setPriceFilter] = useState('withPrice')
  const [sortBy, setSortBy] = useState('priceDesc')
  const [detailCard, setDetailCard] = useState(null)

  const categories = useMemo(() => {
    const tags = [...new Set(allCards.map(c => c.tag))]
    return tags.sort()
  }, [allCards])

  const filteredCards = useMemo(() => {
    let result = allCards
    if (categoryFilter !== 'all') result = result.filter(c => c.tag === categoryFilter)
    if (priceFilter === 'withPrice') result = result.filter(c => c.price > 0)
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.listNo.toLowerCase().includes(q))
    }
    switch (sortBy) {
      case 'priceDesc': return [...result].sort((a, b) => b.price - a.price)
      case 'priceAsc': return [...result].sort((a, b) => a.price - b.price)
      case 'nameAsc': return [...result].sort((a, b) => a.name.localeCompare(b.name))
      default: return result
    }
  }, [allCards, categoryFilter, priceFilter, search, sortBy])

  const selectedIds = new Set(cards.map(c => c.id))

  const toggleCard = (card) => {
    if (selectedIds.has(card.id)) {
      setCards(cards.filter(c => c.id !== card.id))
    } else {
      setCards([...cards, card])
    }
  }

  const selectAll = () => {
    const newCards = [...cards]
    for (const c of filteredCards) {
      if (!selectedIds.has(c.id)) newCards.push(c)
    }
    setCards(newCards)
  }

  const deselectAll = () => {
    const filteredIds = new Set(filteredCards.map(c => c.id))
    setCards(cards.filter(c => !filteredIds.has(c.id)))
  }

  const clearAll = () => setCards([])

  if (allCards.length === 0) {
    return <p className="text-xs text-[#a09580]">データを読み込んでください</p>
  }

  return (
    <div className="space-y-2">
      {/* Card detail modal */}
      {detailCard && (
        <div className="bg-[#faf6ed] border border-[#e0d9c8] rounded-lg p-3 relative">
          <button
            onClick={() => setDetailCard(null)}
            className="absolute top-2 right-2 text-[#a09580] hover:text-[#3a3530] cursor-pointer text-sm"
          >x</button>
          <div className="flex gap-3">
            <div className="w-20 h-28 rounded overflow-hidden bg-[#e8e0cc] flex-shrink-0">
              {detailCard.imageUrl ? (
                <img src={detailCard.imageUrl} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#a09580] text-[10px]">NO IMAGE</div>
              )}
            </div>
            <div className="flex-1 text-xs space-y-1">
              <div className="font-bold text-[#3a3530] text-sm">{detailCard.name}</div>
              <div className="text-[#7a7060]">番号: {detailCard.listNo}</div>
              <div className="text-[#7a7060]">種別: {detailCard.type}</div>
              <div className="text-[#7a7060]">カテゴリ: {detailCard.tag}</div>
              <div className="font-bold text-[#b8860b] text-base">
                {detailCard.price > 0 ? `¥${detailCard.price.toLocaleString()}` : '価格未設定'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
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
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="text-xs">
          <option value="priceDesc">価格 高い順</option>
          <option value="priceAsc">価格 安い順</option>
          <option value="nameAsc">名前順</option>
        </select>
      </div>

      {/* Bulk actions */}
      <div className="flex gap-1 flex-wrap">
        <button onClick={selectAll} className="text-xs px-2 py-1 rounded bg-[#d4a517] hover:bg-[#c09615] text-white cursor-pointer">
          表示中を全選択
        </button>
        <button onClick={deselectAll} className="text-xs px-2 py-1 rounded bg-[#f3eee0] hover:bg-[#e8e0cc] text-[#5a5040] border border-[#d4cbb5] cursor-pointer">
          表示中を解除
        </button>
        <button onClick={clearAll} className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer">
          全解除
        </button>
        <span className="text-xs text-[#a09580] ml-auto self-center">
          {filteredCards.length}件 / 選択{cards.length}枚
        </span>
      </div>

      {/* Card list */}
      <div className="max-h-80 overflow-y-auto space-y-0.5 bg-[#faf6ed] rounded p-1 border border-[#e0d9c8]">
        {filteredCards.map(card => {
          const isSelected = selectedIds.has(card.id)
          return (
            <div
              key={card.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                isSelected
                  ? 'bg-amber-50 border border-[#d4a517]/30'
                  : 'hover:bg-[#f3eee0] border border-transparent'
              }`}
            >
              {/* Thumbnail - click for detail */}
              <div
                className="w-8 h-11 rounded overflow-hidden bg-[#e8e0cc] flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-[#d4a517]"
                onClick={(e) => { e.stopPropagation(); setDetailCard(card) }}
              >
                {card.imageUrl ? (
                  <img src={card.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#a09580] text-[8px]">--</div>
                )}
              </div>
              {/* Info - click for detail */}
              <div
                className="flex-1 min-w-0 cursor-pointer"
                onClick={(e) => { e.stopPropagation(); setDetailCard(card) }}
              >
                <div className={`truncate ${isSelected ? 'text-[#3a3530] font-medium' : 'text-[#5a5040]'}`}>
                  {card.name}
                </div>
                <div className="text-[#a09580]">{card.listNo} / {card.type}</div>
              </div>
              {/* Price */}
              <div className={`font-mono text-right whitespace-nowrap ${isSelected ? 'text-[#b8860b]' : 'text-[#7a7060]'}`}>
                {card.price > 0 ? `¥${card.price.toLocaleString()}` : '-'}
              </div>
              {/* Check - click to toggle */}
              <div
                className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 cursor-pointer ${
                  isSelected ? 'bg-[#d4a517] border-[#d4a517]' : 'border-[#d4cbb5] hover:border-[#d4a517]'
                }`}
                onClick={() => toggleCard(card)}
              >
                {isSelected && <span className="text-white text-[10px]">✓</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
