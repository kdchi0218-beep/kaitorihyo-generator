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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
  } catch (e) {
    console.warn('saveLocalTemplates failed:', e?.name || e)
  }
}

// 後方互換: 既存ユーザーが localStorage に持っている画像を、サーバー保存に
// 移行する間だけ復元用として読む。新規保存ではここに書かない（DBに入れる）。
const IMAGE_STORE_KEY = 'kaitorihyo_template_images'

function getImageStore() {
  try {
    return JSON.parse(localStorage.getItem(IMAGE_STORE_KEY) || '{}')
  } catch { return {} }
}

const IMAGE_KEYS = ['bgImage', 'logoImage', 'placeholderImage']

function hasInlineImage(settings) {
  return IMAGE_KEYS.some(k => typeof settings?.[k] === 'string' && settings[k].startsWith('data:'))
}

/**
 * テンプレ読み込み時の後方互換: サーバー側 settings に画像が無く、
 * 旧localStorage退避データに該当テンプレ名のエントリがあればマージして返す。
 * これにより既存ユーザーは1回上書き保存するだけでDBに自動移行される。
 */
export function restoreTemplateImages(settings, templateName) {
  if (hasInlineImage(settings)) return settings
  const store = getImageStore()
  const images = store?.[templateName]
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
  if (!email) {
    // ローカルフォールバック（未ログイン）
    const templates = getLocalTemplates()
    const existing = templates.findIndex(t => t.name === name)
    const entry = { name, settings, updatedAt: new Date().toISOString() }
    if (existing >= 0) templates[existing] = entry
    else templates.push(entry)
    saveLocalTemplates(templates)
    return templates
  }

  try {
    const res = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, settings }),
    })
    if (!res.ok) throw new Error('API error')
    return await loadTemplates(email)
  } catch {
    const templates = getLocalTemplates()
    const existing = templates.findIndex(t => t.name === name)
    const entry = { name, settings, updatedAt: new Date().toISOString() }
    if (existing >= 0) templates[existing] = entry
    else templates.push(entry)
    saveLocalTemplates(templates)
    return templates
  }
}

export async function updateTemplate(id, name, settings, email) {
  if (!email || !id) {
    return await saveTemplate(name, settings, email)
  }

  try {
    const res = await fetch(`${API_BASE}/templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, settings }),
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
