import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

export default function CardFrameSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingRow label="枠線色">
        <input type="color" value={settings.cardBorderColor} onChange={e => update('cardBorderColor', e.target.value)} />
        <input type="text" value={settings.cardBorderColor} onChange={e => update('cardBorderColor', e.target.value)} className="w-20" />
      </SettingRow>
      <SettingRow label="枠線幅">
        <StepRange value={settings.cardBorderWidth} min={0} max={5} onChange={x => update('cardBorderWidth', x)} />
      </SettingRow>
      <SettingRow label="背景色">
        <input type="color" value={settings.cardBgColor} onChange={e => update('cardBgColor', e.target.value)} />
        <input type="text" value={settings.cardBgColor} onChange={e => update('cardBgColor', e.target.value)} className="w-20" />
      </SettingRow>
      <SettingRow label="角丸">
        <StepRange value={settings.cardBorderRadius} min={0} max={24} onChange={x => update('cardBorderRadius', x)} />
      </SettingRow>
      <SettingToggle label="影" checked={settings.cardShadow} onChange={v => update('cardShadow', v)} />

      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingToggle label="PSAロゴ表示" checked={settings.showPsaBadge} onChange={v => update('showPsaBadge', v)} />
        <p className="text-[10px] text-[#8c95a4] mt-1">PSA10カードの下部にPSAロゴをオーバーレイ表示</p>
      </div>
    </div>
  )
}
