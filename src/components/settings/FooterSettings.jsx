import SettingRow, { SettingToggle } from './SettingRow.jsx'

export default function FooterSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="フッター表示" checked={settings.footerShow} onChange={v => update('footerShow', v)} />
      {settings.footerShow && (
        <>
          <div>
            <label className="text-xs text-[#7a7060] block mb-1">テキスト</label>
            <textarea
              value={settings.footerText}
              onChange={e => update('footerText', e.target.value)}
              rows={2}
              className="w-full bg-white border border-[#d4cbb5] rounded text-xs text-[#3a3530] p-2 resize-none"
              style={{ outline: 'none' }}
            />
          </div>
          <SettingRow label="文字サイズ">
            <input
              type="range"
              min={6}
              max={18}
              value={settings.footerFontSize}
              onChange={e => update('footerFontSize', Number(e.target.value))}
            />
            <span className="text-xs text-[#7a7060] w-6">{settings.footerFontSize}</span>
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.footerColor} onChange={e => update('footerColor', e.target.value)} />
          </SettingRow>
        </>
      )}
    </div>
  )
}
