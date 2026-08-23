import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

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
        <StepRange value={settings.gridColumns} min={3} max={12} onChange={x => update('gridColumns', x)} />
      </SettingRow>
      <SettingRow label="縦（行数）">
        <StepRange value={settings.gridRows} min={1} max={20} onChange={x => update('gridRows', x)} />
      </SettingRow>
      <div className="text-[10px] text-[#8c95a4] text-right">
        {settings.gridColumns} x {settings.gridRows} = 最大 {totalSlots} 枚
      </div>
      <SettingRow label="横の間隔">
        <StepRange value={settings.gridGapX} min={0} max={40} onChange={x => update('gridGapX', x)} />
      </SettingRow>
      <SettingRow label="縦の間隔">
        <StepRange value={settings.gridGapY} min={0} max={40} onChange={x => update('gridGapY', x)} />
      </SettingRow>
      <SettingRow label="左右余白">
        <StepRange value={settings.gridPaddingX} min={0} max={120} onChange={x => update('gridPaddingX', x)} />
      </SettingRow>
      <SettingRow label="上部余白">
        <StepRange value={settings.gridPaddingTop} min={20} max={400} onChange={x => update('gridPaddingTop', x)} />
      </SettingRow>
      <SettingRow label="カード幅">
        <StepRange value={settings.cardWidth} min={60} max={400} onChange={x => update('cardWidth', x)} />
      </SettingRow>
      <SettingRow label="カード高さ">
        <StepRange value={settings.cardHeight} min={80} max={560} onChange={x => update('cardHeight', x)} />
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
