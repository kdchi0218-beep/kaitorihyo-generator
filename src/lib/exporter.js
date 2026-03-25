import { toPng, toJpeg } from 'html-to-image'

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'
  const options = {
    quality: format === 'jpeg' ? 0.95 : 1.0,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
    // CORS対策: 外部画像をインラインBase64に変換
    fetchRequestInit: {
      mode: 'cors',
      cache: 'no-cache',
    },
    // 画像取得失敗時もスキップして続行
    skipAutoScale: true,
    filter: (node) => {
      // noscriptタグを除外（レンダリングエラー防止）
      if (node.tagName === 'NOSCRIPT') return false
      return true
    },
  }

  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue
    try {
      // 外部画像をBase64に事前変換
      await convertImagesToBase64(el)

      const dataUrl = await fn(el, options)
      const link = document.createElement('a')
      const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
      link.download = baseName + suffix + ext
      link.href = dataUrl
      link.click()
      if (i < pageElements.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err) {
      console.error(`ページ${i + 1}の出力エラー:`, err)
      throw new Error(`ページ${i + 1}の出力に失敗しました: ${err?.message || '画像の読み込みエラー'}`)
    }
  }
}

// 外部画像をBase64データURLに変換してCORS問題を回避
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
      // CORS失敗時: プロキシ経由で試行
      try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(src)}`
        const response = await fetch(proxyUrl)
        const blob = await response.blob()
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result)
          reader.readAsDataURL(blob)
        })
        img.src = dataUrl
      } catch {
        // それでもダメなら画像なしで続行
        console.warn('画像変換失敗:', src)
      }
    }
  })
  await Promise.all(promises)
}
