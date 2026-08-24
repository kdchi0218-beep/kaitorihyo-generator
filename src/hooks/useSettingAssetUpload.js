import { useCallback, useEffect, useRef, useState } from 'react'
import { uploadAsset } from '../lib/storeSync.js'

export default function useSettingAssetUpload({ storeId, settingKey, update, onUploadStateChange }) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const activeStoreIdRef = useRef(storeId)
  const activeUploadRef = useRef(null)
  const mountedRef = useRef(false)
  const uploadStateCallbackRef = useRef(onUploadStateChange)
  activeStoreIdRef.current = storeId
  uploadStateCallbackRef.current = onUploadStateChange

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const token = activeUploadRef.current
      if (token) uploadStateCallbackRef.current?.(settingKey, false, token)
      activeUploadRef.current = null
    }
  }, [settingKey])

  useEffect(() => {
    const token = activeUploadRef.current
    if (!token) return
    activeUploadRef.current = null
    setUploading(false)
    setUploadError('')
    uploadStateCallbackRef.current?.(settingKey, false, token)
  }, [settingKey, storeId])

  const handleFileChange = useCallback(async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (!storeId) {
      setUploadError('店舗を選択してから画像をアップロードしてください')
      return
    }

    const uploadStoreId = storeId
    const token = Symbol(settingKey)
    activeUploadRef.current = token
    setUploading(true)
    setUploadError('')
    uploadStateCallbackRef.current?.(settingKey, true, token)
    try {
      const assetUrl = await uploadAsset(uploadStoreId, file)
      if (activeStoreIdRef.current !== uploadStoreId || activeUploadRef.current !== token) return
      update(settingKey, assetUrl)
    } catch (error) {
      if (mountedRef.current && activeUploadRef.current === token) {
        setUploadError(error?.message || '画像をアップロードできませんでした')
      }
    } finally {
      if (activeUploadRef.current === token) {
        activeUploadRef.current = null
        if (mountedRef.current) setUploading(false)
        uploadStateCallbackRef.current?.(settingKey, false, token)
      }
    }
  }, [settingKey, storeId, update])

  const clearUploadError = useCallback(() => setUploadError(''), [])
  return { uploading, uploadError, handleFileChange, clearUploadError }
}
