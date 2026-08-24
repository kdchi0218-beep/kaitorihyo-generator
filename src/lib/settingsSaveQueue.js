import { mergePersistedAssetUrls } from './settingsAssets.js'

/**
 * 店舗ごとに設定保存を直列化し、保存中の連続変更は最新スナップショットへまとめる。
 * 先行保存でdata URLがStorage URLへ移行された場合は、待機中の最新設定にも引き継ぐ。
 */
export function createSettingsSaveQueue({ save, onSaved = () => {}, onError = () => {} }) {
  if (typeof save !== 'function') throw new Error('save must be a function')
  const entries = new Map()

  const drain = async (storeId, entry) => {
    try {
      while (entry.latest) {
        const source = entry.latest
        entry.latest = null
        try {
          const persisted = await save(storeId, source)
          if (entry.latest) entry.latest = mergePersistedAssetUrls(entry.latest, source, persisted)
          onSaved(storeId, source, persisted)
        } catch (error) {
          onError(error, storeId)
        }
      }
    } finally {
      if (entries.get(storeId) === entry) entries.delete(storeId)
    }
  }

  const enqueue = (storeId, settings) => {
    const existing = entries.get(storeId)
    if (existing) {
      existing.latest = settings
      return existing.promise
    }
    const entry = { latest: settings, promise: null }
    entries.set(storeId, entry)
    entry.promise = drain(storeId, entry)
    return entry.promise
  }

  const whenIdle = (storeId) => entries.get(storeId)?.promise || Promise.resolve()
  return { enqueue, whenIdle }
}
