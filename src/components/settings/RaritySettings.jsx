import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

// 遊戯王のレアリティ（rarity列）をカードにオーバーレイ表示する設定
export default function RaritySettings({ settings, update, rarities = [] }) {
  const aliases = settings.rarityAliases || {}
  const hidden = settings.rarityHidden || {}
  const setAlias = (rarity, alias) => {
    const next = { ...aliases }
    if (alias.trim()) next[rarity] = alias.trim()
    else delete next[rarity]
    update('rarityAliases', next)
  }
  const setHidden = (rarity, isHidden) => {
    const next = { ...hidden }
    if (isHidden) next[rarity] = true
    else delete next[rarity]
    update('rarityHidden', next)
  }
  return (
    <div className="space-y-2">
      <SettingToggle label="レアリティを表示" checked={settings.showRarityOverlay} onChange={v => update('showRarityOverlay', v)} />
      {settings.showRarityOverlay && (
        <>
          <SettingRow label="位置">
            <select value={settings.rarityOverlayPosition} onChange={e => update('rarityOverlayPosition', e.target.value)}
              className="text-xs px-2 py-1 rounded border border-[#d0d5dd]">
              <option value="top-left">左上</option>
              <option value="top-center">上中央</option>
              <option value="top-right">右上</option>
              <option value="bottom-left">左下</option>
              <option value="bottom-center">下中央</option>
              <option value="bottom-right">右下</option>
            </select>
          </SettingRow>
          <SettingRow label="横位置（余白）">
            <StepRange value={settings.rarityOverlayOffsetX} min={0} max={40} onChange={x => update('rarityOverlayOffsetX', x)} />
          </SettingRow>
          <SettingRow label="縦位置（余白）">
            <StepRange value={settings.rarityOverlayOffsetY} min={0} max={40} onChange={x => update('rarityOverlayOffsetY', x)} />
          </SettingRow>
          <SettingRow label="文字サイズ">
            <StepRange value={settings.rarityOverlayFontSize} min={6} max={28} onChange={x => update('rarityOverlayFontSize', x)} />
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.rarityOverlayColor} onChange={e => update('rarityOverlayColor', e.target.value)} />
            <input type="text" value={settings.rarityOverlayColor} onChange={e => update('rarityOverlayColor', e.target.value)} className="w-20" />
          </SettingRow>
          <SettingToggle label="背景色" checked={settings.rarityOverlayBgEnabled} onChange={v => update('rarityOverlayBgEnabled', v)} />
          {settings.rarityOverlayBgEnabled && (
            <>
              <SettingRow label="背景色">
                <input type="color" value={settings.rarityOverlayBgColor} onChange={e => update('rarityOverlayBgColor', e.target.value)} />
                <input type="text" value={settings.rarityOverlayBgColor} onChange={e => update('rarityOverlayBgColor', e.target.value)} className="w-20" />
              </SettingRow>
              <SettingRow label="角丸">
                <StepRange value={settings.rarityOverlayRadius} min={0} max={20} onChange={x => update('rarityOverlayRadius', x)} />
              </SettingRow>
            </>
          )}
          <p className="text-[10px] text-[#8c95a4]">遊戯王の rarity 列（例: 20thシークレット）をカード上に表示します。</p>

          {/* 略称マッピング */}
          <div className="pt-2 border-t border-[#e0e4ea]">
            <div className="text-[11px] font-semibold text-[#5a6577] mb-1">レアリティ（表示ON/OFF・略称）</div>
            {rarities.length === 0 ? (
              <p className="text-[10px] text-[#8c95a4]">遊戯王データを取り込むと、ここにレアリティ一覧が出ます。</p>
            ) : (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {rarities.map(r => (
                  <div key={r} className={`flex items-center gap-1.5 ${hidden[r] ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      checked={!hidden[r]}
                      onChange={e => setHidden(r, !e.target.checked)}
                      title="このレアリティを表示する"
                      className="cursor-pointer"
                    />
                    <span className="flex-1 text-[10px] text-[#5a6577] truncate" title={r}>{r}</span>
                    <span className="text-[10px] text-[#8c95a4]">→</span>
                    <input
                      type="text"
                      value={aliases[r] || ''}
                      onChange={e => setAlias(r, e.target.value)}
                      placeholder="略称"
                      className="w-16 text-xs px-1.5 py-0.5 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-[#8c95a4] mt-1">チェックを外すとそのレアリティは非表示。略称を入れるとカード上の表示がその略称になります（例: 20thシークレット→SE）。</p>
          </div>
        </>
      )}
    </div>
  )
}
