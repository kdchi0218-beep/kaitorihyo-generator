import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync, mkdirSync } from 'node:fs'

// ビルドごとに一意のバージョンIDを発行し、
//  - クライアントへ __BUILD_ID__ として埋め込み
//  - public/version.json にも書き出し（開きっぱなしタブが新バージョンを検知する用）
const BUILD_ID = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) // 例: 202606101530
try {
  mkdirSync('public', { recursive: true })
  writeFileSync('public/version.json', JSON.stringify({ id: BUILD_ID }))
} catch { /* read-only環境では埋め込みのみ */ }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
})
