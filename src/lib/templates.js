const API_BASE = '/kaitori/api'

// ローカルストレージフォールバック（API未接続時）
const STORAGE_KEY = 'kaitorihyo_templates'

function getLocalTemplates() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

function saveLocalTemplates(templates) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
}

const IMAGE_STORE_KEY = 'kaitorihyo_template_images'

function getImageStore() {
  try {
    return JSON.parse(localStorage.getItem(IMAGE_STORE_KEY) || '{}')
  } catch { return {} }
}

function saveImageStore(store) {
  localStorage.setItem(IMAGE_STORE_KEY, JSON.stringify(store))
}

/**
 * テンプレート保存時: base64画像をlocalStorageに退避し、settingsからは除去
 * placeholderImageはパス文字列なのでそのまま保持
 */
function cleanSettings(settings, templateName) {
  const s = { ...settings }
  const imageKeys = ['bgImage', 'logoImage']
  const store = getImageStore()
  const saved = {}

  for (const key of imageKeys) {
    if (s[key] && s[key].startsWith('data:')) {
      saved[key] = s[key]
    }
    delete s[key]
  }

  // placeholderImageはパス文字列ならそのまま残す、base64なら退避
  if (s.placeholderImage && s.placeholderImage.startsWith('data:')) {
    saved.placeholderImage = s.placeholderImage
    delete s.placeholderImage
  }

  if (templateName && Object.keys(saved).length > 0) {
    store[templateName] = saved
    saveImageStore(store)
  }

  return s
}

/**
 * テンプレート読み込み時: localStorageから画像を復元
 */
export function restoreTemplateImages(settings, templateName) {
  const store = getImageStore()
  const images = store[templateName]
  if (!images) return settings
  return { ...settings, ...images }
}

// API対応テンプレート操作
export async function loadTemplates(email) {
  if (!email) return getLocalTemplates()

  try {
    const res = await fetch(`${API_BASE}/templates?email=${encodeURIComponent(email)}`)
    if (!res.ok) throw new Error('API error')
    const data = await res.json()
    return data.map(t => ({
      id: t.id,
      name: t.name,
      settings: typeof t.settings === 'string' ? JSON.parse(t.settings) : t.settings,
      updatedAt: t.updated_at,
    }))
  } catch {
    // APIがまだ立ってない場合はlocalStorageフォールバック
    return getLocalTemplates()
  }
}

export async function saveTemplate(name, settings, email) {
  const cleaned = cleanSettings(settings, name)

  if (!email) {
    // ローカルフォールバック
    const templates = getLocalTemplates()
    const existing = templates.findIndex(t => t.name === name)
    const entry = { name, settings: cleaned, updatedAt: new Date().toISOString() }
    if (existing >= 0) templates[existing] = entry
    else templates.push(entry)
    saveLocalTemplates(templates)
    return templates
  }

  try {
    const res = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, settings: cleaned }),
    })
    if (!res.ok) throw new Error('API error')
    return await loadTemplates(email)
  } catch {
    const templates = getLocalTemplates()
    const existing = templates.findIndex(t => t.name === name)
    const entry = { name, settings: cleaned, updatedAt: new Date().toISOString() }
    if (existing >= 0) templates[existing] = entry
    else templates.push(entry)
    saveLocalTemplates(templates)
    return templates
  }
}

export async function updateTemplate(id, name, settings, email) {
  const cleaned = settings ? cleanSettings(settings, name) : null

  if (!email || !id) {
    return await saveTemplate(name, settings, email)
  }

  try {
    const res = await fetch(`${API_BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, settings: cleaned }),
    })
    if (!res.ok) throw new Error('API error')
    return await loadTemplates(email)
  } catch {
    return await saveTemplate(name, settings, email)
  }
}

export async function deleteTemplate(id, name, email) {
  if (!email || !id) {
    const templates = getLocalTemplates().filter(t => t.name !== name)
    saveLocalTemplates(templates)
    return templates
  }

  try {
    const res = await fetch(`${API_BASE}/templates/${id}?email=${encodeURIComponent(email)}`, {
      method: 'DELETE',
    })
    if (!res.ok) throw new Error('API error')
    return await loadTemplates(email)
  } catch {
    const templates = getLocalTemplates().filter(t => t.name !== name)
    saveLocalTemplates(templates)
    return templates
  }
}
