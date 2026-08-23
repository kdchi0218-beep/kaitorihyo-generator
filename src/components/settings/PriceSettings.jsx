import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

export default function PriceSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingRow label="文字サイズ">
        <StepRange value={settings.priceFontSize} min={8} max={48} onChange={x => update('priceFontSize', x)} />
      </SettingRow>
      <SettingRow label="文字色">
        <input type="color" value={settings.priceColor} onChange={e => update('priceColor', e.target.value)} />
        <input type="text" value={settings.priceColor} onChange={e => update('priceColor', e.target.value)} className="w-20" />
      </SettingRow>
      <SettingRow label="太さ">
        <select value={settings.priceFontWeight} onChange={e => update('priceFontWeight', e.target.value)}>
          <option value="normal">普通</option>
          <option value="bold">太字</option>
          <option value="900">極太</option>
        </select>
      </SettingRow>

      {/* 外縁（テキストストローク） */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingToggle label="文字の外縁" checked={settings.priceStroke} onChange={v => update('priceStroke', v)} />
        {settings.priceStroke && (
          <>
            <SettingRow label="外縁色">
              <input type="color" value={settings.priceStrokeColor} onChange={e => update('priceStrokeColor', e.target.value)} />
              <input type="text" value={settings.priceStrokeColor} onChange={e => update('priceStrokeColor', e.target.value)} className="w-20" />
            </SettingRow>
            <SettingRow label="外縁幅">
              <StepRange value={settings.priceStrokeWidth} min={1} max={6} onChange={x => update('priceStrokeWidth', x)} />
            </SettingRow>
          </>
        )}
      </div>

      {/* 背景色 */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingToggle label="価格の背景色" checked={settings.priceBgEnabled} onChange={v => update('priceBgEnabled', v)} />
        {settings.priceBgEnabled && (
          <>
            <SettingToggle label="カード幅に合わせる" checked={settings.priceBgFullWidth} onChange={v => update('priceBgFullWidth', v)} />
            <SettingRow label="背景色">
              <input type="color" value={settings.priceBgColor} onChange={e => update('priceBgColor', e.target.value)} />
              <input type="text" value={settings.priceBgColor} onChange={e => update('priceBgColor', e.target.value)} className="w-20" />
            </SettingRow>
            <SettingRow label="角丸">
              <StepRange value={settings.priceBgRadius} min={0} max={20} onChange={x => update('priceBgRadius', x)} />
            </SettingRow>
            <SettingRow label="横余白">
              <StepRange value={settings.priceBgPaddingX} min={0} max={40} onChange={x => update('priceBgPaddingX', x)} />
            </SettingRow>
            <SettingRow label="縦余白">
              <StepRange value={settings.priceBgPaddingY} min={0} max={20} onChange={x => update('priceBgPaddingY', x)} />
            </SettingRow>
          </>
        )}
      </div>

      {/* カードとの距離 */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingRow label="カードとの距離">
          <StepRange value={settings.priceMarginTop} min={0} max={40} onChange={x => update('priceMarginTop', x)} />
        </SettingRow>
      </div>

      {/* フォーマット */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingRow label="接頭辞">
          <input type="text" value={settings.pricePrefix} onChange={e => update('pricePrefix', e.target.value)} placeholder="例: ¥" className="w-20" />
        </SettingRow>
        <SettingRow label="フォーマット">
          <select value={settings.priceFormat} onChange={e => update('priceFormat', e.target.value)}>
            <option value="comma">カンマ区切り</option>
            <option value="plain">なし</option>
          </select>
        </SettingRow>
        <SettingRow label="価格なし表示">
          <input type="text" value={settings.priceNullText} onChange={e => update('priceNullText', e.target.value)} className="w-16" />
        </SettingRow>
      </div>
    </div>
  )
}
