import { useState, useEffect } from 'react'
import { loadTemplates, saveTemplate, deleteTemplate } from '../lib/templates.js'
import { DEFAULT_SETTINGS, TEMPLATE_PRESETS } from '../lib/defaults.js'

export default function TemplateManager({ settings, setSettings }) {
  const [templates, setTemplates] = useState([])
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(null)

  useEffect(() => {
    setTemplates(loadTemplates())
  }, [])

  const handleSave = () => {
    if (!newName.trim()) return
    const updated = saveTemplate(newName.trim(), settings)
    setTemplates(updated)
    setNewName('')
    showMessage('保存しました')
  }

  const handleLoad = (template) => {
    setSettings(prev => ({ ...prev, ...template.settings }))
    showMessage(`「${template.name}」を読み込みました`)
  }

  const handleDelete = (name) => {
    if (!confirm(`「${name}」を削除しますか？`)) return
    const updated = deleteTemplate(name)
    setTemplates(updated)
    showMessage('削除しました')
  }

  const handlePreset = (preset) => {
    setSettings(prev => ({ ...prev, ...preset.settings }))
    showMessage(`プリセット「${preset.name}」を適用`)
  }

  const handleReset = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    showMessage('デフォルトに戻しました')
  }

  const showMessage = (text) => {
    setMessage(text)
    setTimeout(() => setMessage(null), 2000)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-[#7a7060] block mb-1">プリセット</label>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => handlePreset(p)}
              className="text-xs px-2 py-1 rounded bg-[#f3eee0] hover:bg-[#e8e0cc] text-[#5a5040] border border-[#d4cbb5] cursor-pointer"
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={handleReset}
            className="text-xs px-2 py-1 rounded bg-[#e8e0cc] hover:bg-[#ddd4be] text-[#5a5040] border border-[#d4cbb5] cursor-pointer"
          >
            リセット
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-[#7a7060] block mb-1">新規保存</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="テンプレート名..."
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <button
            onClick={handleSave}
            disabled={!newName.trim()}
            className="px-3 py-1 rounded bg-[#d4a517] hover:bg-[#c09615] disabled:opacity-40 text-white text-xs cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>

      {templates.length > 0 && (
        <div>
          <label className="text-xs text-[#7a7060] block mb-1">保存済みテンプレート</label>
          <div className="space-y-1">
            {templates.map(t => (
              <div key={t.name} className="flex items-center gap-2 bg-[#f3eee0] rounded px-2 py-1.5 border border-[#e0d9c8]">
                <span className="flex-1 text-xs text-[#3a3530] truncate">{t.name}</span>
                <button
                  onClick={() => handleLoad(t)}
                  className="text-xs px-2 py-0.5 rounded bg-[#d4a517] hover:bg-[#c09615] text-white cursor-pointer"
                >
                  読込
                </button>
                <button
                  onClick={() => handleDelete(t.name)}
                  className="text-xs px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-600 cursor-pointer"
                >
                  削除
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {templates.length > 0 && (
        <div>
          <label className="text-xs text-[#7a7060] block mb-1">上書き保存</label>
          <div className="flex flex-wrap gap-1">
            {templates.map(t => (
              <button
                key={t.name}
                onClick={() => {
                  const updated = saveTemplate(t.name, settings)
                  setTemplates(updated)
                  showMessage(`「${t.name}」を上書き保存しました`)
                }}
                className="text-xs px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer"
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {message && (
        <div className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded">
          {message}
        </div>
      )}
    </div>
  )
}
