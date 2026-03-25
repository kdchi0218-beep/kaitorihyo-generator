import { toPng, toJpeg } from 'html-to-image'

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png'
  const options = {
    quality: format === 'jpeg' ? 0.95 : 1.0,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
    fetchRequestInit: { mode: 'cors', cache: 'no-cache' },
    skipAutoScale: true,
    filter: (node) => node.tagName !== 'NOSCRIPT',
  }

  // 全ページの画像を生成
  const images = []
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue
    await convertImagesToBase64(el)
    const dataUrl = await fn(el, options)
    const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
    images.push({ name: baseName + suffix + ext, dataUrl, mimeType })
  }

  if (images.length === 0) throw new Error('出力する画像がありません')

  // 1枚ならそのままダウンロード、複数ならZIP
  if (images.length === 1) {
    const link = document.createElement('a')
    link.download = images[0].name
    link.href = images[0].dataUrl
    link.click()
  } else {
    const mod = await import('jszip')
    const JSZip = typeof mod.default === 'function' ? mod.default : mod
    const zip = new JSZip()
    for (const img of images) {
      const base64 = img.dataUrl.split(',')[1]
      zip.file(img.name, base64, { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.download = baseName + '.zip'
    link.href = URL.createObjectURL(blob)
    link.click()
    URL.revokeObjectURL(link.href)
  }
}

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://app.card-desk.com'

async function convertImagesToBase64(container) {
  const images = container.querySelectorAll('img')
  const promises = Array.from(images).map(async (img) => {
    const src = img.src
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

    // 1. canvas経由（同一オリジンまたはCORS対応画像）
    try {
      if (img.complete && img.naturalWidth > 0) {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0)
        img.src = canvas.toDataURL('image/png')
        return
      }
    } catch {
      // tainted canvas → 次へ
    }

    // 2. 自前プロキシ経由（Firebase Storage等）
    try {
      const proxyUrl = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(src)}`
      const response = await fetch(proxyUrl)
      if (!response.ok) throw new Error('proxy failed')
      const blob = await response.blob()
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.src = dataUrl
    } catch {
      console.warn('画像変換失敗:', src)
    }
  })
  await Promise.all(promises)
}
