import { useState } from 'react'
import { fetchGenreFromSheet } from '../lib/sheetSource.js'
import { GENRE_BY_KEY } from '../lib/genres.js'

// アクティブジャンルのスプシURLを入力し、「更新」で取得→カード化する。
export default function SheetSourcePanel({ activeGenre, sheetUrl, setSheetUrl, loadGenreCards, allCards }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const genre = GENRE_BY_KEY[activeGenre]

  const handleUpdate = async () => {
    if (!sheetUrl.trim()) {
      setStatus({ type: 'error', message: 'スプレッドシートのタブURLを入力してください' })
      return
    }
    setLoading(true)
    setStatus(null)
    try {
      const result = await fetchGenreFromSheet(sheetUrl.trim(), activeGenre)
      loadGenreCards(activeGenre, result.cards, sheetUrl.trim())
      setStatus({
        type: 'success',
        message: `${genre.label} 取得完了 — ${result.total}件（価格あり ${result.withPrice} / 画像あり ${result.withImage}）`,
      })
    } catch (err) {
      setStatus({ type: 'error', message: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-[11px] text-[#5a6577]">
        <span className="font-semibold text-[#1e3a5f]">{genre.label}</span> タブのスプシURL（#gid=付き）
      </div>
      <input
        type="text"
        value={sheetUrl}
        onChange={e => setSheetUrl(activeGenre, e.target.value)}
        placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
        className="w-full text-xs px-2 py-1.5 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleUpdate}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer disabled:opacity-60"
        >
          {loading ? '取得中...' : '更新（取得）'}
        </button>
        {allCards.length > 0 && (
          <span className="text-[11px] text-[#8c95a4]">現在 {allCards.length}件 読み込み済み</span>
        )}
      </div>
      {status && (
        <div className={`text-[11px] px-2 py-1.5 rounded border ${
          status.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-red-50 text-red-700 border-red-200'
        }`}>
          {status.message}
        </div>
      )}
    </div>
  )
}
