import SettingRow, { SettingToggle } from './SettingRow.jsx'

export default function PriceSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingRow label="文字サイズ">
        <input type="range" min={8} max={30} value={settings.priceFontSize} onChange={e => update('priceFontSize', Number(e.target.value))} />
        <span className="text-xs text-[#7a7060] w-6">{settings.priceFontSize}</span>
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
      <div className="pt-2 border-t border-[#e0d9c8]">
        <SettingToggle label="文字の外縁" checked={settings.priceStroke} onChange={v => update('priceStroke', v)} />
        {settings.priceStroke && (
          <>
            <SettingRow label="外縁色">
              <input type="color" value={settings.priceStrokeColor} onChange={e => update('priceStrokeColor', e.target.value)} />
              <input type="text" value={settings.priceStrokeColor} onChange={e => update('priceStrokeColor', e.target.value)} className="w-20" />
            </SettingRow>
            <SettingRow label="外縁幅">
              <input type="range" min={1} max={6} value={settings.priceStrokeWidth} onChange={e => update('priceStrokeWidth', Number(e.target.value))} />
              <span className="text-xs text-[#7a7060] w-4">{settings.priceStrokeWidth}</span>
            </SettingRow>
          </>
        )}
      </div>

      {/* 背景色 */}
      <div className="pt-2 border-t border-[#e0d9c8]">
        <SettingToggle label="価格の背景色" checked={settings.priceBgEnabled} onChange={v => update('priceBgEnabled', v)} />
        {settings.priceBgEnabled && (
          <>
            <SettingRow label="背景色">
              <input type="color" value={settings.priceBgColor} onChange={e => update('priceBgColor', e.target.value)} />
              <input type="text" value={settings.priceBgColor} onChange={e => update('priceBgColor', e.target.value)} className="w-20" />
            </SettingRow>
            <SettingRow label="角丸">
              <input type="range" min={0} max={10} value={settings.priceBgRadius} onChange={e => update('priceBgRadius', Number(e.target.value))} />
              <span className="text-xs text-[#7a7060] w-4">{settings.priceBgRadius}</span>
            </SettingRow>
            <SettingRow label="横余白">
              <input type="range" min={0} max={20} value={settings.priceBgPaddingX} onChange={e => update('priceBgPaddingX', Number(e.target.value))} />
              <span className="text-xs text-[#7a7060] w-4">{settings.priceBgPaddingX}</span>
            </SettingRow>
            <SettingRow label="縦余白">
              <input type="range" min={0} max={10} value={settings.priceBgPaddingY} onChange={e => update('priceBgPaddingY', Number(e.target.value))} />
              <span className="text-xs text-[#7a7060] w-4">{settings.priceBgPaddingY}</span>
            </SettingRow>
          </>
        )}
      </div>

      {/* カードとの距離 */}
      <div className="pt-2 border-t border-[#e0d9c8]">
        <SettingRow label="カードとの距離">
          <input type="range" min={0} max={20} value={settings.priceMarginTop} onChange={e => update('priceMarginTop', Number(e.target.value))} />
          <span className="text-xs text-[#7a7060] w-4">{settings.priceMarginTop}</span>
        </SettingRow>
      </div>

      {/* フォーマット */}
      <div className="pt-2 border-t border-[#e0d9c8]">
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
