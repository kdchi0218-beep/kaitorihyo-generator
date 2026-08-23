import { useEffect, useMemo, useRef, useState } from 'react'
import { HELP_GUIDE, HELP_QUICK_STEPS } from '../lib/helpContent.js'
import { nextFocusableIndex } from '../lib/helpFocus.js'
import usageGuideUrl from '../../docs/USAGE.md?url'

export default function HelpGuide({ label = '使い方', className = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const openerRef = useRef(null)
  const searchRef = useRef(null)
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
    searchRef.current?.focus()
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        close()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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

      {open && (
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) close() }}
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="help-guide-title"
            className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden" style={{ width: 'min(820px, 96vw)', maxHeight: '90vh' }}>
            <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-[#e0e4ea]">
              <div>
                <h2 id="help-guide-title" className="text-base font-bold text-[#1e3a5f]">とんとん 買取表ジェネレーターの使い方</h2>
                <p className="text-[11px] text-[#5a6577] mt-1">初めての方は、まず「最短5ステップ」だけ読めば使い始められます。</p>
              </div>
              <button type="button" onClick={close} aria-label="使い方を閉じる" className="text-[#5a6577] hover:text-[#1e3a5f] text-xl leading-none px-2 py-1 cursor-pointer">×</button>
            </header>

            <div className="overflow-y-auto px-5 py-4 space-y-5">
              <div className="rounded-lg border border-[#cfe0f5] bg-[#f4f8fd] p-3">
                <h3 className="text-xs font-bold text-[#1e3a5f] mb-2">最短5ステップ</h3>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {HELP_QUICK_STEPS.map(step => <li key={step.id} className="rounded bg-white px-3 py-2 border border-[#e0e4ea]">
                    <p className="text-[11px] font-semibold text-[#1e3a5f]">{step.title}</p>
                    <p className="text-[10px] leading-relaxed text-[#5a6577] mt-0.5">{step.body}</p>
                  </li>)}
                </ol>
                <a href={usageGuideUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-block mt-3 text-[11px] font-semibold text-[#1e3a5f] underline underline-offset-2">
                  詳細手順書を別タブで開く（毎日の操作・管理・復旧）
                </a>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label htmlFor="help-guide-search" className="text-[11px] font-semibold text-[#1e3a5f] whitespace-nowrap">説明を検索</label>
                <input ref={searchRef} id="help-guide-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
                  placeholder="例: ブラウザ固定、Excel、定番リスト" className="w-full text-sm px-3 py-2 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]" />
              </div>

              {!query && <nav aria-label="使い方の目次" className="flex flex-wrap gap-x-3 gap-y-1">
                {HELP_GUIDE.map(section => <a key={section.id} href={`#help-${section.id}`} className="text-[11px] text-[#1e3a5f] underline underline-offset-2">{section.title}</a>)}
              </nav>}

              {visibleSections.length ? visibleSections.map(section => <article id={`help-${section.id}`} key={section.id} className="scroll-mt-3 border-t border-[#edf0f4] pt-4">
                <h3 className="text-sm font-bold text-[#1e3a5f] mb-2">{section.title}</h3>
                <ul className="space-y-1.5 list-disc pl-4">
                  {section.items.map(item => <li key={item} className="text-[11px] text-[#5a6577] leading-relaxed">{item}</li>)}
                </ul>
              </article>) : <p className="text-sm text-[#5a6577] py-6 text-center">「{query}」に一致する説明はありません。別の言葉で検索してください。</p>}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
