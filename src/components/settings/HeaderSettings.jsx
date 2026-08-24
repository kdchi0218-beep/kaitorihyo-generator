import { useRef } from 'react'
import useSettingAssetUpload from '../../hooks/useSettingAssetUpload.js'
import { SETTINGS_IMAGE_ACCEPT } from '../../lib/settingsAssets.js'
import SettingRow, { SettingToggle, StepRange } from './SettingRow.jsx'

export default function HeaderSettings({ settings, update, storeId, onUploadStateChange }) {
  const logoRef = useRef()
  const { uploading, uploadError, handleFileChange, clearUploadError } = useSettingAssetUpload({
    storeId,
    settingKey: 'logoImage',
    update,
    onUploadStateChange,
  })

  return (
    <div className="space-y-2">
      <SettingToggle label="ヘッダー表示" checked={settings.headerShow} onChange={v => update('headerShow', v)} />

      {settings.headerShow && (
        <>
          <SettingRow label="タイトル">
            <input
              type="text"
              value={settings.headerText}
              onChange={e => update('headerText', e.target.value)}
              className="w-40"
            />
          </SettingRow>
          <SettingRow label="文字サイズ">
            <StepRange value={settings.headerFontSize} min={20} max={120} onChange={x => update('headerFontSize', x)} />
          </SettingRow>
          <SettingRow label="文字色">
            <input type="color" value={settings.headerColor} onChange={e => update('headerColor', e.target.value)} />
            <input type="text" value={settings.headerColor} onChange={e => update('headerColor', e.target.value)} className="w-20" />
          </SettingRow>
          <SettingRow label="太さ">
            <select value={settings.headerFontWeight} onChange={e => update('headerFontWeight', e.target.value)}>
              <option value="normal">普通</option>
              <option value="bold">太字</option>
              <option value="900">極太</option>
            </select>
          </SettingRow>

          <div className="pt-2 border-t border-[#e0e4ea]">
            <label className="text-xs text-[#5a6577] block mb-1">ロゴ画像</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { clearUploadError(); logoRef.current?.click() }}
                disabled={uploading}
                className="text-xs px-3 py-1.5 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
              >
                {uploading ? 'アップロード中...' : 'ロゴを選択'}
              </button>
              {settings.logoImage && (
                <button
                  type="button"
                  onClick={() => update('logoImage', null)}
                  disabled={uploading}
                  className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
                >
                  削除
                </button>
              )}
              <input ref={logoRef} type="file" accept={SETTINGS_IMAGE_ACCEPT} onChange={handleFileChange} disabled={uploading} className="hidden" />
            </div>
            {uploadError && <div role="alert" className="mt-1 text-[11px] text-red-600">{uploadError}</div>}
            {settings.logoImage && (
              <>
                <img src={settings.logoImage} alt="ロゴ" className="mt-2 max-h-12 rounded" />
                <SettingRow label="ロゴサイズ">
                  <StepRange value={settings.logoSize} min={30} max={200} onChange={x => update('logoSize', x)} />
                </SettingRow>
                <SettingRow label="位置">
                  <select value={settings.logoPosition} onChange={e => update('logoPosition', e.target.value)}>
                    <option value="left">左</option>
                    <option value="center">中央</option>
                    <option value="right">右</option>
                  </select>
                </SettingRow>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
