export default function SettingRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs text-[#7a7060] whitespace-nowrap min-w-[80px]">{label}</label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingToggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs text-[#7a7060]">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-[#d4a517]' : 'bg-[#d4cbb5]'
        }`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 shadow ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </button>
    </div>
  )
}
