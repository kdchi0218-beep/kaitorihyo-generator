import { SettingToggle } from './SettingRow.jsx'

export default function PsaSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="PSAロゴ表示" checked={settings.showPsaBadge} onChange={v => update('showPsaBadge', v)} />
      <p className="text-[10px] text-[#a09580]">PSA10カードの下部にPSAロゴをオーバーレイ表示</p>
    </div>
  )
}
