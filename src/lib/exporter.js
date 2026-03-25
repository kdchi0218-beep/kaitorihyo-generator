import { toPng } from 'html-to-image'

export async function exportToPng(element, filename = '買取表.png') {
  try {
    const dataUrl = await toPng(element, {
      quality: 1.0,
      pixelRatio: 2,
      cacheBust: true,
    })

    const link = document.createElement('a')
    link.download = filename
    link.href = dataUrl
    link.click()
    return true
  } catch (err) {
    console.error('PNG出力エラー:', err)
    throw err
  }
}
