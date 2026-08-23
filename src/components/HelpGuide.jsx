import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { HELP_GUIDE, HELP_QUICK_STEPS } from '../lib/helpContent.js'
import { nextFocusableIndex } from '../lib/helpFocus.js'
import usageGuideUrl from '../../docs/USAGE.md?url'

export default function HelpGuide({ label = '使い方', className = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const openerRef = useRef(null)
  const dialogRef = useRef(null)

  const visibleSections = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja-JP')
    if (!keyword) return HELP_GUIDE
    return HELP_GUIDE.filter(section => [section.title, ...section.items]
      .join(' ').toLocaleLowerCase('ja-JP').includes(keyword))
  }, [query])

  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return undefined
    const originalOverflow = document.body.style.overflow
    const opener = openerRef.current
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus({ preventScroll: true })
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'summary, a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [])].filter(element => element.getAttribute('aria-hidden') !== 'true')
      const nextIndex = nextFocusableIndex(focusable.indexOf(document.activeElement), focusable.length, event.shiftKey)
      if (nextIndex < 0) return
      event.preventDefault()
      focusable[nextIndex].focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', onKeyDown)
      opener?.focus()
    }
  }, [open])

  return (
    <>
      <button ref={openerRef} type="button" onClick={() => { setQuery(''); setOpen(true) }} aria-haspopup="dialog"
        className={className || 'text-[10px] px-2 py-1 rounded border border-[#1e3a5f]/40 text-[#1e3a5f] hover:bg-[#1e3a5f]/10 cursor-pointer'}>{label}</button>

      {open && typeof document !== 'undefined' && createPortal(
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}
          className="p-2 sm:p-4"
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="help-guide-title" aria-describedby="help-guide-description" tabIndex={-1}
            className="w-full max-w-[1040px] max-h-[92svh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
            <header className="flex items-start justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5 border-b border-[#e0e4ea]">
              <div>
                <h2 id="help-guide-title" className="text-lg sm:text-xl font-bold text-[#1e3a5f]">とんとん 買取表ジェネレーターの使い方</h2>
                <p id="help-guide-description" className="text-sm text-[#5a6577] mt-1.5">初めての方は、まず「最短5ステップ」だけ読めば使い始められます。</p>
              </div>
              <button type="button" onClick={close} aria-label="使い方を閉じる" className="shrink-0 w-10 h-10 rounded-lg text-[#5a6577] hover:text-[#1e3a5f] hover:bg-[#eef3f8] text-2xl leading-none cursor-pointer">×</button>
            </header>

            <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 space-y-5">
              <div className="rounded-xl border border-[#cfe0f5] bg-[#f4f8fd] p-4 sm:p-5">
                <h3 className="text-base font-bold text-[#1e3a5f] mb-3">最短5ステップ</h3>
                <ol className="grid gap-3 lg:grid-cols-2">
                  {HELP_QUICK_STEPS.map(step => <li key={step.id} className="rounded-lg bg-white px-3 py-3 sm:px-4 border border-[#dce4ed]">
                    <p className="text-sm font-bold text-[#1e3a5f]">{step.title}</p>
                    <p className="text-[13px] sm:text-sm leading-6 text-[#5a6577] mt-1">{step.body}</p>
                  </li>)}
                </ol>
                <a href={usageGuideUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-4 text-sm font-semibold text-[#1e3a5f] underline underline-offset-2 hover:text-[#2d5d91]">
                  詳細手順書を別タブで開く（毎日の操作・管理・復旧）
                </a>
              </div>

              <div className="rounded-xl border border-[#e0e4ea] bg-white p-3 sm:p-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="help-guide-search" className="text-sm font-bold text-[#1e3a5f] whitespace-nowrap">説明を検索</label>
                <input id="help-guide-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
                  placeholder="例: ブラウザ固定、Excel、定番リスト" className="w-full text-base px-3 py-2.5 border border-[#d0d5dd] rounded-lg outline-none focus:border-[#1e3a5f]" />
              </div>

              {!query && (
                <div>
                  <h3 className="text-base font-bold text-[#1e3a5f]">知りたい項目を選ぶ</h3>
                  <p className="text-sm text-[#5a6577] mt-1 mb-3">項目を押すと、必要な説明だけを開いて読めます。</p>
                  <div className="space-y-2">
                    {visibleSections.map(section => (
                      <details id={`help-${section.id}`} key={section.id} className="group rounded-xl border border-[#dce4ed] bg-white overflow-hidden">
                        <summary className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-[#f7f9fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1e3a5f]">
                          <span className="text-sm sm:text-base font-bold text-[#1e3a5f]">{section.title}</span>
                          <span aria-hidden="true" className="text-xl text-[#6b778c] transition-transform group-open:rotate-45">＋</span>
                        </summary>
                        <div className="border-t border-[#edf0f4] bg-[#fbfcfe] px-4 py-4">
                          <ul className="space-y-2.5 list-disc pl-5">
                            {section.items.map(item => <li key={item} className="text-sm text-[#4b5870] leading-6">{item}</li>)}
                          </ul>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {query && (visibleSections.length ? (
                <div>
                  <h3 className="text-base font-bold text-[#1e3a5f] mb-3">検索結果（{visibleSections.length}件）</h3>
                  <div className="space-y-3">
                    {visibleSections.map(section => <article id={`help-${section.id}`} key={section.id} className="rounded-xl border border-[#dce4ed] bg-[#fbfcfe] p-4 sm:p-5">
                      <h3 className="text-base font-bold text-[#1e3a5f] mb-2">{section.title}</h3>
                      <ul className="space-y-2.5 list-disc pl-5">
                        {section.items.map(item => <li key={item} className="text-sm text-[#4b5870] leading-6">{item}</li>)}
                      </ul>
                    </article>)}
                  </div>
                </div>
              ) : <p className="text-sm text-[#5a6577] py-6 text-center">「{query}」に一致する説明はありません。別の言葉で検索してください。</p>)}
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  )
}
