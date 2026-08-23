import { toCanvas } from 'html-to-image'
import JSZip from 'jszip'

const IMAGE_CONVERSION_CONCURRENCY = 2
const IMAGE_PROXY_ATTEMPTS = 3
const IMAGE_RETRY_BASE_DELAY_MS = 250

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
        const missingImages = Number.isFinite(prepared?.total) && Number.isFinite(prepared?.success)
          ? Math.max(0, prepared.total - prepared.success)
          : 0
        if (missingImages > 0) {
          throw new Error(
            `カード画像${missingImages}枚を取得できませんでした。` +
            '通信状態を確認して、もう一度出力してください',
          )
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

export async function inlineImagesForExport(container, {
  loadImage = fetchImageAsDataUrl,
  concurrency = IMAGE_CONVERSION_CONCURRENCY,
} = {}) {
  const images = Array.from(container.querySelectorAll('img'))
  const targets = images.filter(image => {
    const source = image.currentSrc || image.src
    return source && !source.startsWith('data:') && !source.startsWith('blob:')
  })
  const originals = targets.map(image => ({
    image,
    src: image.getAttribute('src'),
    srcset: image.getAttribute('srcset'),
  }))
  const dataUrlBySource = new Map()
  const failures = []
  let success = 0

  const loadOnce = source => {
    if (!dataUrlBySource.has(source)) {
      dataUrlBySource.set(source, Promise.resolve().then(() => loadImage(source)))
    }
    return dataUrlBySource.get(source)
  }

  const batchSize = Math.max(1, Number(concurrency) || 1)
  for (let start = 0; start < targets.length; start += batchSize) {
    const batch = targets.slice(start, start + batchSize)
    await Promise.all(batch.map(async image => {
      const source = image.currentSrc || image.src
      try {
        const dataUrl = await loadOnce(source)
        image.removeAttribute('srcset')
        image.src = dataUrl
        if (typeof image.decode === 'function') await image.decode()
        success++
      } catch (error) {
        const original = originals.find(item => item.image === image)
        if (original) {
          restoreAttribute(image, 'src', original.src)
          restoreAttribute(image, 'srcset', original.srcset)
        }
        failures.push({
          source,
          alt: image.alt || '',
          message: error?.message || String(error),
        })
        console.warn('画像変換失敗:', error?.message || String(error), source.substring(0, 80))
      }
    }))
  }

  return {
    success,
    total: targets.length,
    failures,
    restore() {
      for (const original of originals) {
        restoreAttribute(original.image, 'src', original.src)
        restoreAttribute(original.image, 'srcset', original.srcset)
      }
      originals.length = 0
    },
  }
}

export async function fetchImageAsDataUrl(source, {
  fetchImpl = fetch,
  responseToDataUrl = imageResponseToDataUrl,
  waitForRetry = waitForImageRetry,
  proxyAttempts = IMAGE_PROXY_ATTEMPTS,
} = {}) {
  try {
    const response = await fetchImpl(source, { mode: 'cors', cache: 'force-cache' })
    if (!response.ok) throw new Error(`${response.status}`)
    return await responseToDataUrl(response)
  } catch {
    // CORS非対応の許可済みドメインは、画像プロキシを使う。
  }

  let lastError
  let attemptsMade = 0
  const attempts = Math.max(1, Number(proxyAttempts) || 1)
  const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(source)}`
  for (let attempt = 1; attempt <= attempts; attempt++) {
    attemptsMade = attempt
    try {
      const response = await fetchImpl(proxyUrl, {
        cache: attempt === 1 ? 'default' : 'reload',
      })
      if (!response.ok) {
        const error = new Error(`画像プロキシ ${response.status}`)
        error.status = response.status
        throw error
      }
      return await responseToDataUrl(response)
    } catch (error) {
      lastError = error
      const retryable = !Number.isFinite(error?.status) || isRetryableProxyStatus(error.status)
      if (attempt >= attempts || !retryable) break
      await waitForRetry(IMAGE_RETRY_BASE_DELAY_MS * attempt)
    }
  }

  const detail = lastError?.message || String(lastError || '取得失敗')
  throw new Error(`画像プロキシを${attemptsMade}回試しましたが取得できません (${detail})`, {
    cause: lastError,
  })
}

function isRetryableProxyStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
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

function waitForImageRetry(delay) {
  return new Promise(resolve => setTimeout(resolve, delay))
}
