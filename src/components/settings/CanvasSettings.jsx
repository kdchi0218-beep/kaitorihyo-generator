import SettingRow from './SettingRow.jsx'

const PRESETS = [
  { label: 'Instagram正方形', w: 1080, h: 1080 },
  { label: 'Instagram縦長', w: 1080, h: 1350 },
  { label: 'Twitter投稿', w: 1200, h: 675 },
  { label: 'A4横', w: 1191, h: 842 },
  { label: 'A4縦', w: 842, h: 1191 },
]

export default function CanvasSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 mb-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => { update('canvasWidth', p.w); update('canvasHeight', p.h) }}
            className="text-xs px-2 py-1 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
          >
            {p.label}
          </button>
        ))}
      </div>
      <SettingRow label="幅 (px)">
        <input
          type="number"
          value={settings.canvasWidth}
          onChange={e => update('canvasWidth', Number(e.target.value))}
          min={400}
          max={4000}
          className="w-20"
        />
      </SettingRow>
      <SettingRow label="高さ (px)">
        <input
          type="number"
          value={settings.canvasHeight}
          onChange={e => update('canvasHeight', Number(e.target.value))}
          min={400}
          max={6000}
          className="w-20"
        />
      </SettingRow>
    </div>
  )
}
