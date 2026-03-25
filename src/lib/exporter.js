import { toPng, toJpeg } from 'html-to-image'

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'

  const images = []
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue

    // crossOrigin属性を一時的に除去（html-to-imageがCORS fetchしないようにする）
    const imgEls = el.querySelectorAll('img')
    const savedAttrs = Array.from(imgEls).map(img => img.getAttribute('crossorigin'))
    imgEls.forEach(img => img.removeAttribute('crossorigin'))

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
      // crossOrigin属性を元に戻す
      imgEls.forEach((img, j) => {
        if (savedAttrs[j]) img.setAttribute('crossorigin', savedAttrs[j])
      })
    }
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
