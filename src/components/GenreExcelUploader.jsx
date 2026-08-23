import { useState, useRef, useCallback } from 'react'
import { parseExcelSingleGenre } from '../lib/excelSource.js'
import { GENRE_BY_KEY } from '../lib/genres.js'

// 1ジャンルだけ Excel から読み込む（そのジャンルのシート or 単一シートExcel）
export default function GenreExcelUploader({ genre, loadGenreCards }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef()
  const label = GENRE_BY_KEY[genre]?.label || genre

  const process = useCallback(async (file) => {
    if (!file) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setStatus({ type: 'error', message: '.xlsx / .xls を選んでください' }); return
    }
    setLoading(true); setStatus(null)
    try {
      const r = await parseExcelSingleGenre(file, genre)
      loadGenreCards(genre, r.cards, `excel-single:${file.name}`)
      const note = r.usedFirstSheet ? `（先頭シート「${r.sheetName}」を${label}として読込）` : ''
      setStatus({ type: 'success', message: `${label} 読込完了 — ${r.total}件 ${note}` })
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [genre, loadGenreCards, label])

  return (
    <div className="space-y-2">
      <div
        className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors ${
          dragging ? 'border-[#1e3a5f] bg-[#1e3a5f]/10' : 'border-[#d0d5dd] hover:border-[#1e3a5f] hover:bg-[#f8f9fb]'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false) }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false); process(e.dataTransfer.files[0]) }}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => process(e.target.files[0])} />
        <p className="text-xs text-[#5a6577]">
          {loading ? '読み込み中...' : dragging ? 'ここにドロップ' : `${label} のExcelをクリック / ドロップ`}
        </p>
        <p className="text-[10px] text-[#8c95a4] mt-0.5">{label}シート、または単一シートのExcelを{label}として読み込み</p>
      </div>
      {status && (
        <div className={`text-[11px] px-2 py-1.5 rounded border ${
          status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {status.message}
        </div>
      )}
    </div>
  )
}
