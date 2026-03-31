import { useState, useEffect } from 'react'
import { loadTemplates, saveTemplate, updateTemplate, deleteTemplate, restoreTemplateImages } from '../lib/templates.js'
import { DEFAULT_SETTINGS, TEMPLATE_PRESETS } from '../lib/defaults.js'

export default function TemplateManager({ settings, setSettings, userEmail }) {
  const [templates, setTemplates] = useState([])
  const [newName, setNewName] = useState('')
  const [message, setMessage] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    loadTemplates(userEmail).then(t => {
      setTemplates(t)
      setLoading(false)
    })
  }, [userEmail])

  const handleSave = async () => {
    if (!newName.trim()) return
    const updated = await saveTemplate(newName.trim(), settings, userEmail)
    setTemplates(updated)
    setNewName('')
    showMessage('保存しました')
  }

  const handleLoad = (template) => {
    const restored = restoreTemplateImages(template.settings, template.name)
    setSettings(prev => ({ ...prev, ...restored }))
    showMessage(`「${template.name}」を読み込みました`)
  }

  const handleDelete = async (template) => {
    if (!confirm(`「${template.name}」を削除しますか？`)) return
    const updated = await deleteTemplate(template.id, template.name, userEmail)
    setTemplates(updated)
    showMessage('削除しました')
  }

  const handleOverwrite = async (template) => {
    const updated = await updateTemplate(template.id, template.name, settings, userEmail)
    setTemplates(updated)
    showMessage(`「${template.name}」を上書き保存しました`)
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
        <label className="text-xs text-[#5a6577] block mb-1">プリセット</label>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_PRESETS.map(p => (
            <button
              key={p.name}
              onClick={() => handlePreset(p)}
              className="text-xs px-2 py-1 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
            >
              {p.name}
            </button>
          ))}
          <button
            onClick={handleReset}
            className="text-xs px-2 py-1 rounded bg-[#dfe3ea] hover:bg-[#d0d5dd] text-[#5a6577] border border-[#d0d5dd] cursor-pointer"
          >
            リセット
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-[#5a6577] block mb-1">新規保存</label>
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
            className="px-3 py-1 rounded bg-[#1e3a5f] hover:bg-[#162d4a] disabled:opacity-40 text-white text-xs cursor-pointer"
          >
            保存
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-xs text-[#8c95a4]">読み込み中...</div>
      )}

      {templates.length > 0 && (
        <div>
          <label className="text-xs text-[#5a6577] block mb-1">保存済みテンプレート</label>
          <div className="space-y-1">
            {templates.map(t => (
              <div key={t.id || t.name} className="flex items-center gap-2 bg-[#eef1f6] rounded px-2 py-1.5 border border-[#e0e4ea]">
                <span className="flex-1 text-xs text-[#1e3a5f] truncate">{t.name}</span>
                <button
                  onClick={() => handleLoad(t)}
                  className="text-xs px-2 py-0.5 rounded bg-[#1e3a5f] hover:bg-[#162d4a] text-white cursor-pointer"
                >
                  読込
                </button>
                <button
                  onClick={() => handleOverwrite(t)}
                  className="text-xs px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 cursor-pointer"
                >
                  上書
                </button>
                <button
                  onClick={() => handleDelete(t)}
                  className="text-xs px-2 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-600 cursor-pointer"
                >
                  削除
                </button>
              </div>
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
