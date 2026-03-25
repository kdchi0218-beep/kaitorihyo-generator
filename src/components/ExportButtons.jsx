import { useState } from 'react'
import { exportAllPages } from '../lib/exporter.js'

export default function ExportButtons({ cards, settings }) {
  const [exporting, setExporting] = useState(false)
  const [format, setFormat] = useState('png')

  const maxCards = settings.gridColumns * settings.gridRows
  const pageCount = Math.max(1, Math.ceil(cards.length / maxCards))

  const handleExport = async () => {
    // DOMから全ページを取得（preview-canvas-0, preview-canvas-1, ...）
    const elements = []
    let i = 0
    while (true) {
      const el = document.getElementById(`preview-canvas-${i}`)
      if (!el) break
      elements.push(el)
      i++
    }
    if (elements.length === 0) return

    setExporting(true)
    try {
      const baseName = `${settings.headerText || '買取表'}_${new Date().toISOString().slice(0, 10)}`
      await exportAllPages(elements, format, baseName)
    } catch (err) {
      console.error('Export error:', err)
      alert('画像出力に失敗しました: ' + (err?.message || String(err)))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="px-4 py-3 border-t border-[#e0d9c8] bg-white flex gap-2 items-center">
      <select
        value={format}
        onChange={e => setFormat(e.target.value)}
        className="text-xs px-2 py-2.5 rounded-lg border border-[#d4cbb5] bg-[#faf6ed]"
      >
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
      </select>
      <button
        onClick={handleExport}
        disabled={cards.length === 0 || exporting}
        className="flex-1 py-2.5 rounded-lg bg-[#d4a517] hover:bg-[#c09615] disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
      >
        {exporting ? (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        )}
        {pageCount > 1 ? `${format.toUpperCase()}出力（${pageCount}枚ZIP）` : `${format.toUpperCase()}出力`}
      </button>
      <div className="text-xs text-[#a09580] whitespace-nowrap">
        {cards.length}枚
        {pageCount > 1 && ` / ${pageCount}ページ`}
      </div>
    </div>
  )
}
