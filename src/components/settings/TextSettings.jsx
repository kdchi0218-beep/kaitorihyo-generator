import SettingRow, { SettingToggle } from './SettingRow.jsx'

export default function TextSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="カード名表示" checked={settings.showCardName} onChange={v => update('showCardName', v)} />
      {settings.showCardName && (
        <>
          <SettingRow label="文字サイズ">
            <input
              type="range"
              min={6}
              max={20}
              value={settings.cardNameFontSize}
              onChange={e => update('cardNameFontSize', Number(e.target.value))}
            />
            <span className="text-xs text-[#7a7060] w-6">{settings.cardNameFontSize}</span>
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.cardNameColor} onChange={e => update('cardNameColor', e.target.value)} />
            <input type="text" value={settings.cardNameColor} onChange={e => update('cardNameColor', e.target.value)} className="w-20" />
          </SettingRow>
          <SettingRow label="行数">
            <select value={settings.cardNameLines} onChange={e => update('cardNameLines', Number(e.target.value))}>
              <option value={1}>1行</option>
              <option value={2}>2行</option>
            </select>
          </SettingRow>
        </>
      )}
    </div>
  )
}
