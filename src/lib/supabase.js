import { createClient } from '@supabase/supabase-js'

// 公開キー（publishable）はフロント露出OK。RLSで保護されているため安全。
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  // 後段の分かりにくいクラッシュより、原因が一目で分かる早期エラーにする
  throw new Error('Supabase の環境変数が未設定です: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY（.env.local または Vercel の環境変数を確認）')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'tonton-auth',
  },
})
