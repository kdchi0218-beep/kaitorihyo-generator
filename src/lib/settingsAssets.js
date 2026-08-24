const IMAGE_SETTING_KEYS = ['bgImage', 'logoImage', 'placeholderImage']
const IMAGE_NAME_BY_KEY = {
  bgImage: 'background',
  logoImage: 'logo',
  placeholderImage: 'placeholder',
}
const EXTENSION_BY_TYPE = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
])
const DATA_IMAGE_PATTERN = /^data:(image\/(?:avif|gif|jpeg|png|webp));base64,([a-z0-9+/=\s]+)$/i
const MAX_ASSET_BYTES = 10 * 1024 * 1024

function namedImageBlob(bytes, type, name) {
  const blob = new Blob([bytes], { type })
  Object.defineProperty(blob, 'name', { configurable: true, value: name })
  return blob
}

function dataImageToBlob(value, key) {
  const match = value.match(DATA_IMAGE_PATTERN)
  if (!match) throw new Error('保存できない形式の画像です。PNG / JPEG / WebP / GIF / AVIFを選び直してください')
  const type = match[1].toLowerCase()
  const extension = EXTENSION_BY_TYPE.get(type)
  const encoded = match[2].replace(/\s/g, '')
  if (encoded.length > Math.ceil(MAX_ASSET_BYTES / 3) * 4 + 4) {
    throw new Error('画像は10MB以下のファイルを選んでください')
  }
  let binary
  try { binary = atob(encoded) }
  catch { throw new Error('画像データが壊れています。画像を選び直してください') }
  if (binary.length > MAX_ASSET_BYTES) throw new Error('画像は10MB以下のファイルを選んでください')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return namedImageBlob(bytes, type, `${IMAGE_NAME_BY_KEY[key]}.${extension}`)
}

function storedAsset(value) {
  if (typeof value !== 'string' || !value.startsWith('/api/asset?')) return null
  const query = value.slice(value.indexOf('?') + 1)
  const path = new URLSearchParams(query).get('path') || ''
  const [storeId] = path.split('/')
  return storeId ? { path, storeId } : null
}

async function copyStoredAsset(value, key, fetchAsset) {
  const response = await fetchAsset(value, { credentials: 'same-origin' })
  if (!response?.ok) throw new Error('テンプレート画像を送信先へコピーできませんでした')
  const blob = await response.blob()
  const type = String(blob.type || '').toLowerCase()
  const extension = EXTENSION_BY_TYPE.get(type)
  if (!extension) throw new Error('保存済み画像の形式を確認できませんでした')
  return namedImageBlob(await blob.arrayBuffer(), type, `${IMAGE_NAME_BY_KEY[key]}.${extension}`)
}

/**
 * settings内の画像本体をprivate Storageへ移し、軽量なBFF URLへ置き換える。
 * 同じ店舗の保存済みURLや通常の既定画像パスはそのまま維持する。
 */
export async function persistSettingsAssets(storeId, settings, {
  upload,
  fetchAsset = globalThis.fetch,
} = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('設定データが正しくありません')
  }
  if (typeof upload !== 'function') throw new Error('画像アップロードを開始できません')

  const replacements = new Map()
  let next = settings

  for (const key of IMAGE_SETTING_KEYS) {
    const value = settings[key]
    if (typeof value !== 'string' || !value) continue

    const asset = storedAsset(value)
    const needsDataMigration = value.startsWith('data:')
    const needsStoreCopy = asset && asset.storeId.toLowerCase() !== String(storeId).toLowerCase()
    if (!needsDataMigration && !needsStoreCopy) continue

    let uploadedUrl = replacements.get(value)
    if (!uploadedUrl) {
      const file = needsDataMigration
        ? dataImageToBlob(value, key)
        : await copyStoredAsset(value, key, fetchAsset)
      uploadedUrl = await upload(storeId, file)
      replacements.set(value, uploadedUrl)
    }
    if (next === settings) next = { ...settings }
    next[key] = uploadedUrl
  }

  return next
}

/** 送信中に設定が変わっても、移行対象だった画像だけを安全に差し替える。 */
export function mergePersistedAssetUrls(current, source, persisted) {
  let next = current
  for (const key of IMAGE_SETTING_KEYS) {
    if (current?.[key] !== source?.[key] || persisted?.[key] === source?.[key]) continue
    if (next === current) next = { ...current }
    next[key] = persisted[key]
  }
  return next
}

export const SETTINGS_IMAGE_ACCEPT = '.avif,.gif,.jpg,.jpeg,.png,.webp'
