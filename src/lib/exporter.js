import { toPng, toJpeg } from 'html-to-image'

export async function exportImage(element, format = 'png', filename = '買取表') {
  const options = {
    quality: format === 'jpeg' ? 0.95 : 1.0,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
  }

  try {
    const fn = format === 'jpeg' ? toJpeg : toPng
    const ext = format === 'jpeg' ? '.jpg' : '.png'
    const dataUrl = await fn(element, options)

    const link = document.createElement('a')
    link.download = filename + ext
    link.href = dataUrl
    link.click()
    return true
  } catch (err) {
    console.error('画像出力エラー:', err)
    throw err
  }
}

export async function exportAllPages(pageElements, format = 'png', baseName = '買取表') {
  const fn = format === 'jpeg' ? toJpeg : toPng
  const ext = format === 'jpeg' ? '.jpg' : '.png'
  const options = {
    quality: format === 'jpeg' ? 0.95 : 1.0,
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
  }

  for (let i = 0; i < pageElements.length; i++) {
    const el = pageElements[i]
    if (!el) continue
    try {
      const dataUrl = await fn(el, options)
      const link = document.createElement('a')
      const suffix = pageElements.length > 1 ? `_${i + 1}` : ''
      link.download = baseName + suffix + ext
      link.href = dataUrl
      link.click()
      // ブラウザが連続ダウンロードをブロックしないよう少し待つ
      if (i < pageElements.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (err) {
      console.error(`ページ${i + 1}の出力エラー:`, err)
      throw err
    }
  }
}
