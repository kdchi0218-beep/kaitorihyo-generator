import { useState } from 'react'

export default function AccordionSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-[#faf6ed] rounded-lg border border-[#e0d9c8] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-[#3a3530] hover:bg-[#f3eee0] transition-colors cursor-pointer"
      >
        <span className="flex-1 text-left">{title}</span>
        <svg
          className={`w-4 h-4 text-[#a09580] transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[#e0d9c8]">
          {children}
        </div>
      )}
    </div>
  )
}
