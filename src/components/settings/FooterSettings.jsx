import SettingRow, { SettingToggle } from './SettingRow.jsx'

export default function FooterSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="更新日時を表示" checked={settings.showUpdateDate} onChange={v => update('showUpdateDate', v)} />
      {settings.showUpdateDate && (
        <>
          <SettingRow label="表示位置">
            <select
              value={settings.updateDatePosition || 'bottom'}
              onChange={e => update('updateDatePosition', e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[#d0d5dd]"
            >
              <option value="top">ヘッダー下</option>
              <option value="bottom">フッター上</option>
            </select>
          </SettingRow>
          <SettingRow label="左右位置">
            <select
              value={settings.updateDateAlign || 'right'}
              onChange={e => update('updateDateAlign', e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[#d0d5dd]"
            >
              <option value="left">左</option>
              <option value="center">中央</option>
              <option value="right">右</option>
            </select>
          </SettingRow>
          <SettingRow label="文字サイズ">
            <input type="range" min={8} max={24} value={settings.updateDateFontSize} onChange={e => update('updateDateFontSize', Number(e.target.value))} />
            <span className="text-xs text-[#5a6577] w-6">{settings.updateDateFontSize}</span>
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.updateDateColor} onChange={e => update('updateDateColor', e.target.value)} />
          </SettingRow>
        </>
      )}
      <div className="pt-2 border-t border-[#e0e4ea]" />
      <SettingToggle label="フッター表示" checked={settings.footerShow} onChange={v => update('footerShow', v)} />
      {settings.footerShow && (
        <>
          <div>
            <label className="text-xs text-[#5a6577] block mb-1">テキスト</label>
            <textarea
              value={settings.footerText}
              onChange={e => update('footerText', e.target.value)}
              rows={2}
              className="w-full bg-white border border-[#d0d5dd] rounded text-xs text-[#1e3a5f] p-2 resize-none"
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
            <span className="text-xs text-[#5a6577] w-6">{settings.footerFontSize}</span>
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.footerColor} onChange={e => update('footerColor', e.target.value)} />
          </SettingRow>
        </>
      )}
    </div>
  )
}
