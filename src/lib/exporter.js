import { toPng, toJpeg } from 'html-to-image'

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : ''

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'

  const images = []
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue

    // 全画像をbase64に変換してからhtml-to-imageに渡す
    const converted = await convertImagesToBase64(el)
    console.log(`ページ${i + 1}: ${converted.success}/${converted.total}枚変換成功`)

    const dataUrl = await fn(el, {
      quality: format === 'jpeg' ? 0.95 : 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
      filter: (node) => node.tagName !== 'NOSCRIPT',
    })
    const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
    images.push({ name: baseName + suffix + ext, dataUrl })
  }

  if (images.length === 0) throw new Error('出力する画像がありません')

  if (images.length === 1) {
    const a = document.createElement('a')
    a.download = images[0].name
    a.href = images[0].dataUrl
    a.click()
  } else {
    const mod = await import('jszip')
    const JSZip = typeof mod.default === 'function' ? mod.default : mod
    const zip = new JSZip()
    for (const img of images) {
      zip.file(img.name, img.dataUrl.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = baseName + '.zip'
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }
}

async function convertImagesToBase64(container) {
  const imgs = Array.from(container.querySelectorAll('img'))
  let success = 0
  const total = imgs.filter(img => img.src && !img.src.startsWith('data:') && !img.src.startsWith('blob:')).length

  await Promise.all(imgs.map(async (img) => {
    const src = img.src
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

    // 自前プロキシ経由でbase64変換
    try {
      const res = await fetch(`${API_BASE}/api/image-proxy?url=${encodeURIComponent(src)}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      const dataUrl = await blobToDataUrl(blob)
      img.src = dataUrl
      success++
      return
    } catch (e) {
      console.warn('プロキシ失敗:', e.message, src.substring(0, 80))
    }

    // 直接fetch（CORS対応サーバーの場合）
    try {
      const res = await fetch(src, { mode: 'cors' })
      const blob = await res.blob()
      img.src = await blobToDataUrl(blob)
      success++
      return
    } catch {
      console.warn('直接fetchも失敗:', src.substring(0, 80))
    }
  }))

  return { success, total }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
