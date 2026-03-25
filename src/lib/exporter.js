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
    const JSZip = mod.default || mod
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

async function convertImagesToBase64(container) {
  const images = container.querySelectorAll('img')
  const promises = Array.from(images).map(async (img) => {
    const src = img.src
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

    try {
      const response = await fetch(src, { mode: 'cors', cache: 'no-cache' })
      const blob = await response.blob()
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.src = dataUrl
    } catch {
      // CORS非対応の画像はスキップ（画像なしで出力続行）
    }
  })
  await Promise.all(promises)
}
