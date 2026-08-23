import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

export default function FooterSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="更新日時を表示" checked={settings.showUpdateDate} onChange={v => update('showUpdateDate', v)} />
      {settings.showUpdateDate && (
        <>
          <SettingToggle label="自由配置（px指定）" checked={settings.updateDateFreePos} onChange={v => update('updateDateFreePos', v)} />
          {settings.updateDateFreePos ? (
            <>
              <SettingRow label="X（左から px）">
                <input type="number" step={5} value={settings.updateDateX ?? 20} onChange={e => update('updateDateX', Number(e.target.value))} className="w-24" />
              </SettingRow>
              <SettingRow label="Y（上から px）">
                <input type="number" step={5} value={settings.updateDateY ?? 20} onChange={e => update('updateDateY', Number(e.target.value))} className="w-24" />
              </SettingRow>
            </>
          ) : (
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
            </>
          )}
          <SettingRow label="文字サイズ">
            <StepRange value={settings.updateDateFontSize} min={8} max={24} onChange={x => update('updateDateFontSize', x)} />
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.updateDateColor} onChange={e => update('updateDateColor', e.target.value)} />
          </SettingRow>
          <SettingToggle label="背景色を付ける" checked={settings.updateDateBgEnabled} onChange={v => update('updateDateBgEnabled', v)} />
          {settings.updateDateBgEnabled && (
            <SettingRow label="背景色">
              <input type="color" value={settings.updateDateBgColor || '#000000'} onChange={e => update('updateDateBgColor', e.target.value)} />
            </SettingRow>
          )}
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
            <StepRange value={settings.footerFontSize} min={6} max={18} onChange={x => update('footerFontSize', x)} />
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.footerColor} onChange={e => update('footerColor', e.target.value)} />
          </SettingRow>
          <SettingToggle label="背景色を付ける" checked={settings.footerBgEnabled} onChange={v => update('footerBgEnabled', v)} />
          {settings.footerBgEnabled && (
            <SettingRow label="背景色">
              <input type="color" value={settings.footerBgColor || '#000000'} onChange={e => update('footerBgColor', e.target.value)} />
            </SettingRow>
          )}
        </>
      )}
    </div>
  )
}
