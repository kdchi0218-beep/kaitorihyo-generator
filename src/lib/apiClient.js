// 同一オリジンBFFだけを呼ぶ業務データクライアント。
// Supabase JWT・端末秘密値はブラウザ側に置かない。

function notifyInvalidSession(status, payload) {
  if ((status !== 401 && status !== 423) || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('tonton-auth-invalid', {
    detail: { status, code: payload?.code || null },
  }))
}

export async function postData(action, payload = {}) {
  const response = await fetch('/api/data', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const json = await response.json().catch(() => ({}))
  if (!response.ok) {
    notifyInvalidSession(response.status, json)
    throw new Error(json.error || `データの取得に失敗しました (${response.status})`)
  }
  return json.data
}

/** 一回限りのStorage署名URLへ直接アップロードする（認証情報は送らない）。 */
export async function uploadSignedAsset(upload, file) {
  const body = new FormData()
  body.append('cacheControl', '3600')
  body.append('', file, file.name || 'upload')
  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'false' },
    body,
  })
  if (!response.ok) throw new Error(`画像アップロードに失敗しました (${response.status})`)
  return upload.assetUrl
}
