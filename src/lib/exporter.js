import { toPng, toJpeg } from 'html-to-image'
import JSZip from 'jszip'

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'

  const images = []
  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue

    // 全画像をbase64に変換してからhtml-to-imageに渡す
    const converted = await convertImagesToBase64(el)
    if (import.meta.env.DEV) console.log(`ページ${i + 1}: ${converted.success}/${converted.total}枚変換成功`)

    const dataUrl = await fn(el, {
      quality: format === 'jpeg' ? 0.95 : 1.0,
      pixelRatio: 2,
      skipAutoScale: true,
      backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
      // export-exclude クラスの要素（「前回価格」マーカー等の画面専用表示）は出力画像に載せない
      filter: (node) => node.tagName !== 'NOSCRIPT' && !(node.classList && node.classList.contains('export-exclude')),
    })
    const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
    images.push({ name: baseName + suffix + ext, dataUrl })
  }

  if (images.length === 0) throw new Error('出力する画像がありません')

  if (images.length === 1) {
    triggerDownload(images[0].dataUrl, images[0].name)
  } else {
    const zip = new JSZip()
    for (const img of images) {
      zip.file(img.name, img.dataUrl.split(',')[1], { base64: true })
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    triggerDownload(url, baseName + '.zip')
    // クリック処理が完了する前にURLを破棄しないよう遅延解放
    setTimeout(() => URL.revokeObjectURL(url), 5000)
  }
}

// body に追加してから click（モバイルSafari等での未発火対策）
function triggerDownload(href, filename) {
  const a = document.createElement('a')
  a.download = filename
  a.href = href
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

async function convertImagesToBase64(container) {
  const imgs = Array.from(container.querySelectorAll('img'))
  let success = 0
  const total = imgs.filter(img => img.src && !img.src.startsWith('data:') && !img.src.startsWith('blob:')).length

  await Promise.all(imgs.map(async (img) => {
    const src = img.src
    if (!src || src.startsWith('data:') || src.startsWith('blob:')) return

    // ① 直接fetch（同一オリジン or CORS許可されたクロスオリジン=Supabase等）
    try {
      const res = await fetch(src, { mode: 'cors', cache: 'no-cache' })
      if (res.ok) {
        const blob = await res.blob()
        img.src = await blobToDataUrl(blob)
        success++
        return
      }
    } catch {
      // CORS不可 → プロキシへフォールバック
    }

    // ② Vercel画像プロキシ経由（CORS非対応ドメインの保険）
    try {
      const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(src)}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const blob = await res.blob()
      img.src = await blobToDataUrl(blob)
      success++
      return
    } catch (e) {
      console.warn('画像変換失敗:', e.message, src.substring(0, 80))
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
