import { useRef } from 'react'
import useSettingAssetUpload from '../../hooks/useSettingAssetUpload.js'
import { SETTINGS_IMAGE_ACCEPT } from '../../lib/settingsAssets.js'
import SettingRow from './SettingRow.jsx'

export default function BackgroundSettings({ settings, update, storeId, onUploadStateChange }) {
  const fileRef = useRef()
  const { uploading, uploadError, handleFileChange, clearUploadError } = useSettingAssetUpload({
    storeId,
    settingKey: 'bgImage',
    update,
    onUploadStateChange,
  })

  return (
    <div className="space-y-2">
      <SettingRow label="背景色">
        <input
          type="color"
          value={settings.bgColor}
          onChange={e => update('bgColor', e.target.value)}
        />
        <input
          type="text"
          value={settings.bgColor}
          onChange={e => update('bgColor', e.target.value)}
          className="w-20"
        />
      </SettingRow>

      <div className="py-1">
        <label className="text-xs text-[#5a6577] block mb-1">背景画像</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { clearUploadError(); fileRef.current?.click() }}
            disabled={uploading}
            className="text-xs px-3 py-1.5 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
          >
            {uploading ? 'アップロード中...' : '画像を選択'}
          </button>
          {settings.bgImage && (
            <button
              type="button"
              onClick={() => update('bgImage', null)}
              disabled={uploading}
              className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
            >
              削除
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={SETTINGS_IMAGE_ACCEPT}
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </div>
        {uploadError && <div role="alert" className="mt-1 text-[11px] text-red-600">{uploadError}</div>}
        {settings.bgImage && (
          <img
            src={settings.bgImage}
            alt="背景プレビュー"
            className="mt-2 max-h-20 rounded border border-[#d0d5dd]"
          />
        )}
      </div>

      {settings.bgImage && (
        <SettingRow label="フィット">
          <select
            value={settings.bgImageFit}
            onChange={e => update('bgImageFit', e.target.value)}
          >
            <option value="cover">全体を覆う</option>
            <option value="contain">全体を表示</option>
            <option value="stretch">引き伸ばし</option>
          </select>
        </SettingRow>
      )}
    </div>
  )
}
