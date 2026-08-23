import { toCanvas } from 'html-to-image'
import JSZip from 'jszip'

const IMAGE_CONVERSION_CONCURRENCY = 6
const TRANSPARENT_IMAGE_PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

export function createExporter({
  prepareImages = inlineImagesForExport,
  renderPage = renderPageToBlob,
  createZip = () => new JSZip(),
  downloadBlob = triggerBlobDownload,
  yieldToBrowser = waitForBrowser,
} = {}) {
  return async function exportPages(pageElements, format = 'png', baseName = '買取表') {
    const pages = Array.from(pageElements || []).filter(Boolean)
    if (pages.length === 0) throw new Error('出力する画像がありません')

    const normalizedFormat = format === 'jpeg' ? 'jpeg' : 'png'
    const extension = normalizedFormat === 'jpeg' ? '.jpg' : '.png'
    const zip = pages.length > 1 ? createZip() : null

    for (let index = 0; index < pages.length; index++) {
      let prepared
      let imageBlob
      try {
        prepared = await prepareImages(pages[index], index)
        if (import.meta.env?.DEV) {
          console.log(`ページ${index + 1}: ${prepared.success}/${prepared.total}枚変換成功`)
        }
        imageBlob = await renderPage(pages[index], normalizedFormat, index)
        if (!imageBlob || typeof imageBlob.size !== 'number' || imageBlob.size === 0) {
          throw new Error('画像データを作成できませんでした')
        }
      } catch (error) {
        const detail = error?.message || String(error)
        throw new Error(`${index + 1}ページ目の画像作成に失敗しました: ${detail}`, { cause: error })
      } finally {
        prepared?.restore?.()
      }

      const suffix = pages.length > 1 ? `_${index + 1}` : ''
      const filename = `${baseName}${suffix}${extension}`
      if (zip) {
        // Base64文字列へ戻さずバイナリのまま保持し、ピークメモリを抑える。
        const imageBytes = new Uint8Array(await imageBlob.arrayBuffer())
        zip.file(filename, imageBytes)
        imageBlob = null
        if (index < pages.length - 1) await yieldToBrowser()
      } else {
        await downloadBlob(imageBlob, filename)
      }
    }

    if (zip) {
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
        streamFiles: true,
      })
      await downloadBlob(zipBlob, `${baseName}.zip`)
    }
  }
}

export const exportAllPages = createExporter()

async function renderPageToBlob(element, format) {
  let canvas
  try {
    canvas = await toCanvas(element, {
      quality: format === 'jpeg' ? 0.95 : 1,
      pixelRatio: 2,
      skipAutoScale: true,
      backgroundColor: format === 'jpeg' ? '#ffffff' : undefined,
      // 取得不能な画像が1枚あっても、ページ全体の出力は止めない。
      imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
      // 「前回価格」マーカーなど、画面だけで使う要素は出力しない。
      filter: node => node.tagName !== 'NOSCRIPT' &&
        !(node.classList && node.classList.contains('export-exclude')),
    })

    return await canvasToBlob(
      canvas,
      format === 'jpeg' ? 'image/jpeg' : 'image/png',
      format === 'jpeg' ? 0.95 : undefined,
    )
  } finally {
    // 次ページへ進む前に巨大な描画バッファを明示的に解放する。
    if (canvas) {
      canvas.width = 1
      canvas.height = 1
    }
  }
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob)
      else reject(new Error('ブラウザが画像データを作成できませんでした'))
    }, mimeType, quality)
  })
}

// body に追加してから click（モバイルSafari等での未発火対策）。
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // クリック処理が完了する前にURLを破棄しないよう遅延解放する。
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

async function inlineImagesForExport(container) {
  const images = Array.from(container.querySelectorAll('img'))
  const targets = images.filter(image => {
    const source = image.currentSrc || image.src
    return source && !source.startsWith('data:') && !source.startsWith('blob:')
  })
  const originals = []
  let success = 0

  for (let start = 0; start < targets.length; start += IMAGE_CONVERSION_CONCURRENCY) {
    const batch = targets.slice(start, start + IMAGE_CONVERSION_CONCURRENCY)
    await Promise.all(batch.map(async image => {
      const source = image.currentSrc || image.src
      try {
        const dataUrl = await fetchImageAsDataUrl(source)
        originals.push({
          image,
          src: image.getAttribute('src'),
          srcset: image.getAttribute('srcset'),
        })
        image.removeAttribute('srcset')
        image.src = dataUrl
        await image.decode?.().catch(() => {})
        success++
      } catch (error) {
        console.warn('画像変換失敗:', error?.message || String(error), source.substring(0, 80))
      }
    }))
  }

  return {
    success,
    total: targets.length,
    restore() {
      for (const original of originals) {
        restoreAttribute(original.image, 'src', original.src)
        restoreAttribute(original.image, 'srcset', original.srcset)
      }
      originals.length = 0
    },
  }
}

async function fetchImageAsDataUrl(source) {
  try {
    const response = await fetch(source, { mode: 'cors', cache: 'force-cache' })
    if (!response.ok) throw new Error(`${response.status}`)
    return await imageResponseToDataUrl(response)
  } catch {
    // CORS非対応の許可済みドメインは、画像プロキシを使う。
  }

  const response = await fetch(`/api/image-proxy?url=${encodeURIComponent(source)}`)
  if (!response.ok) throw new Error(`画像プロキシ ${response.status}`)
  return imageResponseToDataUrl(response)
}

async function imageResponseToDataUrl(response) {
  const blob = await response.blob()
  if (!blob.type.toLowerCase().startsWith('image/')) {
    throw new Error(`画像ではない応答です (${blob.type || 'Content-Typeなし'})`)
  }
  return blobToDataUrl(blob)
}

function restoreAttribute(element, name, value) {
  if (value === null) element.removeAttribute(name)
  else element.setAttribute(name, value)
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error || new Error('画像を読み込めませんでした'))
    reader.readAsDataURL(blob)
  })
}

function waitForBrowser() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0))
    } else {
      setTimeout(resolve, 0)
    }
  })
}
