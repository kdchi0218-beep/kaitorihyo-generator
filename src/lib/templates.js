const STORAGE_KEY = 'kaitorihyo_templates'

export function loadTemplates() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

export function saveTemplate(name, settings) {
  const templates = loadTemplates()
  // 背景画像・ロゴは巨大なので保存しない（パスのみ記録）
  const settingsToSave = { ...settings }
  delete settingsToSave.bgImage
  delete settingsToSave.logoImage

  const existing = templates.findIndex(t => t.name === name)
  const entry = {
    name,
    settings: settingsToSave,
    updatedAt: new Date().toISOString(),
  }

  if (existing >= 0) {
    templates[existing] = entry
  } else {
    templates.push(entry)
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  return templates
}

export function deleteTemplate(name) {
  const templates = loadTemplates().filter(t => t.name !== name)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  return templates
}
