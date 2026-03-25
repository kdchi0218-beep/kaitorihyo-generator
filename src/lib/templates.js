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

function cleanSettings(settings) {
  const s = { ...settings }
  delete s.bgImage
  delete s.logoImage
  delete s.placeholderImage
  return s
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
  const cleaned = cleanSettings(settings)

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
  const cleaned = settings ? cleanSettings(settings) : null

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
