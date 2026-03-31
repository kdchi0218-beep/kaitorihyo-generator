import SettingRow, { SettingToggle } from './SettingRow.jsx'

export default function GridSettings({ settings, update, userFormat }) {
  const defaultPlaceholder = userFormat === 'tonton' ? './card-back-onepiece.jpg' : './card-back.jpg'
  const totalSlots = settings.gridColumns * settings.gridRows

  const handlePlaceholderUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => update('placeholderImage', ev.target.result)
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-2">
      <SettingRow label="横（列数）">
        <input type="range" min={3} max={12} value={settings.gridColumns} onChange={e => update('gridColumns', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-6">{settings.gridColumns}</span>
      </SettingRow>
      <SettingRow label="縦（行数）">
        <input type="range" min={1} max={20} value={settings.gridRows} onChange={e => update('gridRows', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-6">{settings.gridRows}</span>
      </SettingRow>
      <div className="text-[10px] text-[#8c95a4] text-right">
        {settings.gridColumns} x {settings.gridRows} = 最大 {totalSlots} 枚
      </div>
      <SettingRow label="横の間隔">
        <input type="range" min={0} max={40} value={settings.gridGapX} onChange={e => update('gridGapX', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-6">{settings.gridGapX}</span>
      </SettingRow>
      <SettingRow label="縦の間隔">
        <input type="range" min={0} max={40} value={settings.gridGapY} onChange={e => update('gridGapY', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-6">{settings.gridGapY}</span>
      </SettingRow>
      <SettingRow label="左右余白">
        <input type="range" min={0} max={120} value={settings.gridPaddingX} onChange={e => update('gridPaddingX', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-6">{settings.gridPaddingX}</span>
      </SettingRow>
      <SettingRow label="上部余白">
        <input type="range" min={20} max={400} value={settings.gridPaddingTop} onChange={e => update('gridPaddingTop', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-8">{settings.gridPaddingTop}</span>
      </SettingRow>
      <SettingRow label="カード幅">
        <input type="range" min={60} max={400} value={settings.cardWidth} onChange={e => update('cardWidth', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-8">{settings.cardWidth}</span>
      </SettingRow>
      <SettingRow label="カード高さ">
        <input type="range" min={80} max={560} value={settings.cardHeight} onChange={e => update('cardHeight', Number(e.target.value))} />
        <span className="text-xs text-[#5a6577] w-8">{settings.cardHeight}</span>
      </SettingRow>

      <div className="pt-2 border-t border-[#e0e4ea] space-y-2">
        <SettingToggle label="空きスロットを埋める" checked={settings.fillEmptySlots} onChange={v => update('fillEmptySlots', v)} />
        {settings.fillEmptySlots && (
          <div className="flex items-center gap-2">
            {settings.placeholderImage && (
              <img src={settings.placeholderImage} alt="" className="w-8 h-11 object-contain rounded border border-[#e0e4ea]" />
            )}
            <label className="text-xs px-2 py-1 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer">
              画像を変更
              <input type="file" accept="image/*" onChange={handlePlaceholderUpload} className="hidden" />
            </label>
            {settings.placeholderImage !== defaultPlaceholder && (
              <button
                onClick={() => update('placeholderImage', defaultPlaceholder)}
                className="text-[10px] text-[#8c95a4] hover:text-[#5a6577] cursor-pointer"
              >
                デフォルトに戻す
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
