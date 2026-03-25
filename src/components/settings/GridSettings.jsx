import SettingRow from './SettingRow.jsx'

export default function GridSettings({ settings, update }) {
  const totalSlots = settings.gridColumns * settings.gridRows

  return (
    <div className="space-y-2">
      <SettingRow label="横（列数）">
        <input type="range" min={3} max={12} value={settings.gridColumns} onChange={e => update('gridColumns', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.gridColumns}</span>
      </SettingRow>
      <SettingRow label="縦（行数）">
        <input type="range" min={1} max={20} value={settings.gridRows} onChange={e => update('gridRows', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.gridRows}</span>
      </SettingRow>
      <div className="text-[10px] text-[#a09580] text-right">
        {settings.gridColumns} x {settings.gridRows} = 最大 {totalSlots} 枚
      </div>
      <SettingRow label="横の間隔">
        <input type="range" min={0} max={20} value={settings.gridGapX} onChange={e => update('gridGapX', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.gridGapX}</span>
      </SettingRow>
      <SettingRow label="縦の間隔">
        <input type="range" min={0} max={20} value={settings.gridGapY} onChange={e => update('gridGapY', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.gridGapY}</span>
      </SettingRow>
      <SettingRow label="左右余白">
        <input type="range" min={0} max={60} value={settings.gridPaddingX} onChange={e => update('gridPaddingX', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.gridPaddingX}</span>
      </SettingRow>
      <SettingRow label="上部余白">
        <input type="range" min={20} max={200} value={settings.gridPaddingTop} onChange={e => update('gridPaddingTop', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-8">{settings.gridPaddingTop}</span>
      </SettingRow>
      <SettingRow label="カード幅">
        <input type="range" min={60} max={250} value={settings.cardWidth} onChange={e => update('cardWidth', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-8">{settings.cardWidth}</span>
      </SettingRow>
      <SettingRow label="カード高さ">
        <input type="range" min={80} max={350} value={settings.cardHeight} onChange={e => update('cardHeight', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-8">{settings.cardHeight}</span>
      </SettingRow>
    </div>
  )
}
