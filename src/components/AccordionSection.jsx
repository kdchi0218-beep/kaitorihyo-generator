import { useState } from 'react'

export default function AccordionSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-[#f8f9fb] rounded-lg border border-[#e0e4ea] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#1e3a5f] hover:bg-[#eef1f6] transition-colors cursor-pointer"
      >
        <span className="flex-1 text-left">{title}</span>
        <svg
          className={`w-4 h-4 text-[#8c95a4] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[#e0e4ea]">
          {children}
        </div>
      )}
    </div>
  )
}
