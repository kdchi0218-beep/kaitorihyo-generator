import { useRef } from 'react'
import SettingRow from './SettingRow.jsx'

export default function BackgroundSettings({ settings, update }) {
  const fileRef = useRef()

  const handleBgImage = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => update('bgImage', ev.target.result)
    reader.readAsDataURL(file)
  }

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
        <label className="text-xs text-[#7a7060] block mb-1">背景画像</label>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-xs px-3 py-1.5 rounded bg-[#f3eee0] hover:bg-[#e8e0cc] text-[#5a5040] border border-[#d4cbb5] cursor-pointer"
          >
            画像を選択
          </button>
          {settings.bgImage && (
            <button
              onClick={() => update('bgImage', null)}
              className="text-xs px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
            >
              削除
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleBgImage}
            className="hidden"
          />
        </div>
        {settings.bgImage && (
          <img
            src={settings.bgImage}
            alt="背景プレビュー"
            className="mt-2 max-h-20 rounded border border-[#d4cbb5]"
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
