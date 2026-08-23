import { useState, useRef, useCallback } from 'react'
import { GENRE_BY_KEY, GENRES } from '../lib/genres.js'
import {
  INPUT_SOURCES,
  INPUT_SOURCE_OPTIONS,
  normalizeInputSource,
  parseInputFile,
  shouldReplaceImportedGenre,
} from '../lib/inputSources.js'

export default function ExcelUploader({ loadGenreCards, onGenreDetected }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [inputSource, setInputSource] = useState(() => (
    normalizeInputSource(localStorage.getItem('tonton_input_source'))
  ))
  const fileRef = useRef()

  const selectInputSource = (nextSource) => {
    setInputSource(nextSource)
    localStorage.setItem('tonton_input_source', nextSource)
    setStatus(null)
  }

  const process = useCallback(async (file) => {
    if (!file) return
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setStatus({ type: 'error', message: '.xlsx / .xls ファイルを選んでください' }); return
    }
    setLoading(true); setStatus(null)
    try {
      const res = await parseInputFile(file, inputSource)
      const lines = []
      let format = 'unknown'
      const genresToReport = inputSource === INPUT_SOURCES.VAULT
        ? GENRES
        : Object.keys(res).map(key => GENRE_BY_KEY[key]).filter(Boolean)

      for (const g of genresToReport) {
        const r = res[g.key]
        if (r && r.format && r.format !== 'unknown') format = r.format  // 検出した投入形式
        if (r && shouldReplaceImportedGenre(inputSource, r)) {
          loadGenreCards(g.key, r.cards || [], `excel:${inputSource}:${file.name}`)
        }
        if (r && r.total > 0) {
          lines.push(`${g.label} ${r.total}件`)
        } else {
          lines.push(`${g.label} —`)
        }
      }

      const detectedGenre = Object.entries(res).find(([, result]) => result?.total > 0)?.[0]
      if (detectedGenre) onGenreDetected?.(detectedGenre)

      const fmtLabel = inputSource === INPUT_SOURCES.TONTON
        ? 'とんとん形式'
        : format === 'new' ? 'Vault新形式(商品ID付き)' : format === 'old' ? 'Vault旧形式' : 'Vault形式不明'
      setStatus({ type: 'success', message: `［${fmtLabel}］読込完了 ▶ ${lines.join(' / ')}` })
    } catch (e) {
      setStatus({ type: 'error', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [inputSource, loadGenreCards, onGenreDetected])

  const onDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setDragging(false)
    process(e.dataTransfer.files[0])
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[#eef1f6] p-1" role="group" aria-label="Excel入力タイプ">
        {INPUT_SOURCE_OPTIONS.map(option => {
          const selected = inputSource === option.value
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => selectInputSource(option.value)}
              className={`rounded-md px-2 py-2 text-left transition-colors ${
                selected ? 'bg-white text-[#1e3a5f] shadow-sm' : 'text-[#5a6577] hover:bg-white/60'
              }`}
            >
              <span className="block text-[11px] font-semibold">{option.label}</span>
              <span className="block text-[9px] opacity-75">{option.description}</span>
            </button>
          )
        })}
      </div>
      <div
        className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
          dragging ? 'border-[#1e3a5f] bg-[#1e3a5f]/10' : 'border-[#d0d5dd] hover:border-[#1e3a5f] hover:bg-[#f8f9fb]'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(false) }}
        onDrop={onDrop}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => process(e.target.files[0])} />
        <p className="text-sm text-[#5a6577]">
          {loading ? '読み込み中...' : dragging ? 'ここにドロップ' : 'Excelをクリック / ドラッグ&ドロップ'}
        </p>
        <p className="text-[10px] text-[#8c95a4] mt-1">
          {inputSource === INPUT_SOURCES.VAULT
            ? 'Vault: 1ファイルで5ジャンル一括読み込み'
            : 'とんとん: ポケモン／ワンピースの単一シート'}
        </p>
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
