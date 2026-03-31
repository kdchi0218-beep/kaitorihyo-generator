import { useState, useRef, useCallback } from 'react'
import { parseExcel } from '../lib/excelParser.js'

export default function ExcelUploader({ allCards, setAllCards, setCards, userFormat, updateSettings }) {
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState(null)
  const fileRef = useRef()

  const processFile = useCallback(async (file) => {
    if (!file) return
    setLoading(true)
    setStatus(null)

    try {
      const result = await parseExcel(file, userFormat || 'carddesk')
      setAllCards(result.cards)
      setFileName(file.name)
      const withPrice = result.cards.filter(c => c.price > 0)
      setCards(withPrice)

      // ゲーム種別でプレースホルダーを自動切り替え
      const placeholder = result.gameType === 'onepiece'
        ? './card-back-onepiece.jpg'
        : './card-back.jpg'
      updateSettings('placeholderImage', placeholder)

      const formatLabel = result.format === 'tonton' ? 'トントン' : 'CardDesk'
      const masterInfo = result.format === 'tonton'
        ? `${result.cards.length}件（画像: ${result.matchedImages}件）`
        : result.hasMaster
          ? `マスター: ${result.masterCount}件（画像: ${result.imageCount}件）`
          : 'ポケモンシートなし（画像なし）'

      setStatus({
        type: 'success',
        message: `[${formatLabel}] 読み込み完了 — ${masterInfo} / 買取表: ${result.cards.length}件（価格あり: ${withPrice.length}件, 画像マッチ: ${result.matchedImages}件）`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }, [setAllCards, setCards])

  const handleClear = () => {
    setAllCards([])
    setCards([])
    setStatus(null)
    setFileName(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = (e) => processFile(e.target.files[0])

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setDragging(false) }
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
      processFile(file)
    } else {
      setStatus({ type: 'error', message: '.xlsx または .xls ファイルをドロップしてください' })
    }
  }

  return (
    <div className="space-y-3">
      {/* loaded state */}
      {allCards.length > 0 && fileName && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
          <span className="flex-1 text-xs text-green-700 truncate">{fileName}</span>
          <button
            onClick={handleClear}
            className="text-xs px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
          >
            削除
          </button>
        </div>
      )}

      {/* drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-[#1e3a5f] bg-[#1e3a5f]/10'
            : allCards.length > 0
              ? 'border-[#d0d5dd] hover:border-[#1e3a5f] hover:bg-[#f8f9fb]'
              : 'border-[#d0d5dd] hover:border-[#1e3a5f] hover:bg-[#f8f9fb]'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        <svg className="mx-auto mb-2" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dragging ? '#1e3a5f' : '#8c95a4'} strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <p className="text-sm text-[#5a6577]">
          {loading ? '読み込み中...' : dragging ? 'ここにドロップ' : allCards.length > 0 ? 'クリックまたはドロップで再読み込み' : 'クリックまたはドラッグ&ドロップ'}
        </p>
        <p className="text-[10px] text-[#8c95a4] mt-1">
          {userFormat === 'tonton' ? 'トントンフォーマット' : '.xlsx ファイルを読み込み'}
        </p>
      </div>

      {status && (
        <div className={`text-xs px-3 py-2 rounded ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {status.message}
        </div>
      )}

      {allCards.length > 0 && (
        <div className="text-xs text-[#5a6577] space-y-1">
          <p>カテゴリ:</p>
          {Object.entries(
            allCards.reduce((acc, c) => { acc[c.tag] = (acc[c.tag] || 0) + 1; return acc }, {})
          ).map(([tag, count]) => (
            <span key={tag} className="inline-block bg-[#eef1f6] text-[#5a6577] px-2 py-0.5 rounded mr-1 mb-1">{tag}: {count}</span>
          ))}
        </div>
      )}
    </div>
  )
}
