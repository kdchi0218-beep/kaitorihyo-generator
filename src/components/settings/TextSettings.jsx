import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

export default function TextSettings({ settings, update }) {
  return (
    <div className="space-y-2">
      <SettingToggle label="カード名表示" checked={settings.showCardName} onChange={v => update('showCardName', v)} />
      {settings.showCardName && (
        <>
          <SettingRow label="文字サイズ">
            <StepRange value={settings.cardNameFontSize} min={6} max={30} onChange={x => update('cardNameFontSize', x)} />
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.cardNameColor} onChange={e => update('cardNameColor', e.target.value)} />
            <input type="text" value={settings.cardNameColor} onChange={e => update('cardNameColor', e.target.value)} className="w-20" />
          </SettingRow>
          <SettingRow label="行数">
            <select value={settings.cardNameLines} onChange={e => update('cardNameLines', Number(e.target.value))}>
              <option value={1}>1行</option>
              <option value={2}>2行</option>
            </select>
          </SettingRow>

          {/* カード名の背景色（金額と同様） */}
          <div className="pt-2 border-t border-[#e0e4ea]">
            <SettingToggle label="カード名の背景色" checked={settings.cardNameBgEnabled} onChange={v => update('cardNameBgEnabled', v)} />
            {settings.cardNameBgEnabled && (
              <>
                <SettingToggle label="カード幅に合わせる" checked={settings.cardNameBgFullWidth} onChange={v => update('cardNameBgFullWidth', v)} />
                <SettingRow label="背景色">
                  <input type="color" value={settings.cardNameBgColor} onChange={e => update('cardNameBgColor', e.target.value)} />
                  <input type="text" value={settings.cardNameBgColor} onChange={e => update('cardNameBgColor', e.target.value)} className="w-20" />
                </SettingRow>
                <SettingRow label="角丸">
                  <StepRange value={settings.cardNameBgRadius} min={0} max={20} onChange={x => update('cardNameBgRadius', x)} />
                </SettingRow>
                <SettingRow label="横余白">
                  <StepRange value={settings.cardNameBgPaddingX} min={0} max={40} onChange={x => update('cardNameBgPaddingX', x)} />
                </SettingRow>
                <SettingRow label="縦余白">
                  <StepRange value={settings.cardNameBgPaddingY} min={0} max={20} onChange={x => update('cardNameBgPaddingY', x)} />
                </SettingRow>
              </>
            )}
          </div>
        </>
      )}

      {/* 型番（list_no）表示 */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <SettingToggle label="型番（list_no）を表示" checked={settings.showListNo} onChange={v => update('showListNo', v)} />
        {settings.showListNo && (
          <>
            <SettingRow label="文字サイズ">
              <StepRange value={settings.listNoFontSize} min={5} max={20} onChange={x => update('listNoFontSize', x)} />
            </SettingRow>
            <SettingRow label="文字色">
              <input type="color" value={settings.listNoColor} onChange={e => update('listNoColor', e.target.value)} />
              <input type="text" value={settings.listNoColor} onChange={e => update('listNoColor', e.target.value)} className="w-20" />
            </SettingRow>
            <SettingRow label="上余白">
              <StepRange value={settings.listNoMarginTop ?? 1} min={-30} max={30} onChange={x => update('listNoMarginTop', x)} />
            </SettingRow>
            <SettingRow label="下余白">
              <StepRange value={settings.listNoMarginBottom ?? 0} min={-30} max={30} onChange={x => update('listNoMarginBottom', x)} />
            </SettingRow>
            <SettingRow label="横余白">
              <StepRange value={settings.listNoBgPaddingX ?? 5} min={0} max={30} onChange={x => update('listNoBgPaddingX', x)} />
            </SettingRow>
            <SettingRow label="縦余白">
              <StepRange value={settings.listNoBgPaddingY ?? 1} min={0} max={20} onChange={x => update('listNoBgPaddingY', x)} />
            </SettingRow>
            <SettingToggle label="型番の背景色" checked={settings.listNoBgEnabled} onChange={v => update('listNoBgEnabled', v)} />
            {settings.listNoBgEnabled && (
              <SettingRow label="背景色">
                <input type="color" value={settings.listNoBgColor} onChange={e => update('listNoBgColor', e.target.value)} />
                <input type="text" value={settings.listNoBgColor} onChange={e => update('listNoBgColor', e.target.value)} className="w-20" />
              </SettingRow>
            )}
          </>
        )}
      </div>
    </div>
  )
}
