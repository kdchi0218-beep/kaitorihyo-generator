import { useState } from 'react'
import { exportToPng } from '../lib/exporter.js'

export default function ExportButtons({ cards, settings }) {
  const [exporting, setExporting] = useState(false)

  const handlePng = async () => {
    const el = document.getElementById('preview-canvas')
    if (!el) return
    setExporting(true)
    try {
      const filename = `${settings.headerText || '買取表'}_${new Date().toISOString().slice(0, 10)}.png`
      await exportToPng(el, filename)
    } catch (err) {
      alert('PNG出力に失敗しました: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="px-4 py-3 border-t border-[#e0d9c8] bg-white flex gap-2">
      <button
        onClick={handlePng}
        disabled={cards.length === 0 || exporting}
        className="flex-1 py-2.5 rounded-lg bg-[#d4a517] hover:bg-[#c09615] disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
      >
        {exporting ? (
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        )}
        PNG出力
      </button>
      <div className="text-xs text-[#a09580] self-center">
        {cards.length}枚
      </div>
    </div>
  )
}
