import { toPng, toJpeg } from 'html-to-image'

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:3001'
  : 'https://app.card-desk.com'

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'

  // 全ページの画像を生成
  const images = []
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue

    // 全imgタグをbase64に置換してからhtml-to-imageに渡す
    const origSrcs = await replaceAllImagesWithBase64(el)

    try {
      const dataUrl = await fn(el, {
        quality: format === 'jpeg' ? 0.95 : 1.0,
        pixelRatio: 2,
        skipAutoScale: true,
        backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
        filter: (node) => node.tagName !== 'NOSCRIPT',
      })
      const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
      images.push({ name: baseName + suffix + ext, dataUrl })
    } finally {
      // DOM元に戻す（プレビュー表示を壊さないため）
      restoreOriginalSrcs(el, origSrcs)
    }
  }

  if (images.length === 0) throw new Error('出力する画像がありません')

  // 1枚ならそのままダウンロード、複数ならZIP
  if (images.length === 1) {
    downloadDataUrl(images[0].dataUrl, images[0].name)
  } else {
    const mod = await import('jszip')
    const JSZip = typeof mod.default === 'function' ? mod.default : mod
    const zip = new JSZip()
    for (const img of images) {
      zip.file(img.name, img.dataUrl.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    downloadDataUrl(url, baseName + '.zip')
    URL.revokeObjectURL(url)
  }
}

function downloadDataUrl(href, name) {
  const a = document.createElement('a')
  a.download = name
  a.href = href
  a.click()
}

// 全img要素をbase64 data URLに置換し、元のsrcを返す
async function replaceAllImagesWithBase64(container) {
  const imgs = Array.from(container.querySelectorAll('img'))
  const origSrcs = imgs.map(img => img.src)

  await Promise.all(imgs.map(async (img) => {
    const src = img.src
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

    // プロキシ経由でbase64に変換
    try {
      const proxyUrl = `${API_BASE}/api/image-proxy?url=${encodeURIComponent(src)}`
      const res = await fetch(proxyUrl)
      if (!res.ok) throw new Error(`proxy ${res.status}`)
      const blob = await res.blob()
      img.src = await blobToDataUrl(blob)
    } catch (e) {
      console.warn('画像プロキシ変換失敗、canvasフォールバック:', src, e)
      // canvasフォールバック
      try {
        img.src = imgToDataUrl(img)
      } catch {
        console.warn('canvas変換も失敗:', src)
      }
    }
  }))

  return origSrcs
}

function restoreOriginalSrcs(container, origSrcs) {
  const imgs = Array.from(container.querySelectorAll('img'))
  imgs.forEach((img, i) => {
    if (origSrcs[i]) img.src = origSrcs[i]
  })
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function imgToDataUrl(img) {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  return canvas.toDataURL('image/png')
}
