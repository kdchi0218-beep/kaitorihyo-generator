// −／＋ボタン付きスライダー（1ステップずつクリックで動かせる）
export function StepRange({ value, min, max, step = 1, onChange }) {
  const v = Number(value)
  const clamp = (n) => Math.max(min, Math.min(max, Number(n.toFixed(4))))
  const btn = 'w-5 h-5 flex items-center justify-center rounded border border-[#d0d5dd] bg-white text-[#5a6577] hover:bg-[#eef1f6] cursor-pointer text-xs leading-none select-none flex-shrink-0'
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(clamp(v - step))} className={btn}>−</button>
      <input type="range" min={min} max={max} step={step} value={v} onChange={e => onChange(Number(e.target.value))} />
      <button type="button" onClick={() => onChange(clamp(v + step))} className={btn}>＋</button>
      <span className="text-xs text-[#5a6577] w-7 text-right">{v}</span>
    </div>
  )
}

export default function SettingRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs text-[#5a6577] whitespace-nowrap min-w-[80px]">{label}</label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function SettingToggle({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs text-[#5a6577]">{label}</label>
      <button
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${
          checked ? 'bg-[#3d7c4f]' : 'bg-[#d0d5dd]'
        }`}
      >
        <div className={`w-4 h-4 bg-white rounded-full transition-transform mx-0.5 shadow ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`} />
      </button>
    </div>
  )
}
