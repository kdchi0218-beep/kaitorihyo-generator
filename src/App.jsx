import { useState, useCallback, useEffect } from 'react'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import Preview from './components/Preview.jsx'
import { DEFAULT_SETTINGS } from './lib/defaults.js'

const STORAGE_KEYS = {
  cards: 'kaitori_cards',
  allCards: 'kaitori_allCards',
  settings: 'kaitori_settings',
  schemaVersion: 'kaitori_schemaVersion',
}

// IDが「カード番号」だけだと重複しkey衝突するため、行番号付きIDに移行
const CURRENT_SCHEMA_VERSION = 2

function migrateStorage() {
  try {
    const v = Number(localStorage.getItem(STORAGE_KEYS.schemaVersion) || '1')
    if (v < CURRENT_SCHEMA_VERSION) {
      localStorage.removeItem(STORAGE_KEYS.cards)
      localStorage.removeItem(STORAGE_KEYS.allCards)
      localStorage.setItem(STORAGE_KEYS.schemaVersion, String(CURRENT_SCHEMA_VERSION))
    }
  } catch {
    // ignore
  }
}
migrateStorage()

function loadFromStorage(key, fallback) {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : fallback
  } catch {
    return fallback
  }
}

// localStorageは5MB前後で頭打ち。base64画像入りsettingsをそのまま入れると
// QuotaExceededErrorになる場合があるので、失敗時は画像を剥がして再試行する。
function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value)
    return true
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)) {
      return false
    }
    console.warn('localStorage.setItem failed:', e?.name || e)
    return false
  }
}

function persistSettings(settings) {
  const json = JSON.stringify(settings)
  if (safeSetItem(STORAGE_KEYS.settings, json)) return
  // 縮退保存: 画像系を剥がして再試行（サーバー側に画像は別途保存される想定）
  const slim = { ...settings, bgImage: null, logoImage: null }
  if (typeof slim.placeholderImage === 'string' && slim.placeholderImage.startsWith('data:')) {
    delete slim.placeholderImage
  }
  safeSetItem(STORAGE_KEYS.settings, JSON.stringify(slim))
}

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('auth') === 'true')
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') || '')
  const [userFormat, setUserFormat] = useState(() => localStorage.getItem('userFormat') || 'carddesk')
  const [cards, setCards] = useState(() => loadFromStorage(STORAGE_KEYS.cards, []))
  const [allCards, setAllCards] = useState(() => loadFromStorage(STORAGE_KEYS.allCards, []))
  const [settings, setSettings] = useState(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS))

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.cards, JSON.stringify(cards))
  }, [cards])

  useEffect(() => {
    safeSetItem(STORAGE_KEYS.allCards, JSON.stringify(allCards))
  }, [allCards])

  useEffect(() => {
    persistSettings(settings)
  }, [settings])

  const updateSettings = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  const handleClearData = () => {
    setCards([])
    setAllCards([])
    localStorage.removeItem(STORAGE_KEYS.cards)
    localStorage.removeItem(STORAGE_KEYS.allCards)
  }

  const handleLogout = () => {
    localStorage.removeItem('auth')
    localStorage.removeItem('userEmail')
    localStorage.removeItem('userFormat')
    localStorage.removeItem(STORAGE_KEYS.cards)
    localStorage.removeItem(STORAGE_KEYS.allCards)
    localStorage.removeItem(STORAGE_KEYS.settings)
    setAuthed(false)
    setUserEmail('')
  }

  if (!authed) {
    return <Login onLogin={(id) => { setAuthed(true); setUserEmail(id); setUserFormat(localStorage.getItem('userFormat') || 'carddesk') }} />
  }

  return (
    <>
      <Sidebar
        allCards={allCards}
        setAllCards={setAllCards}
        cards={cards}
        setCards={setCards}
        settings={settings}
        updateSettings={updateSettings}
        setSettings={setSettings}
        userEmail={userEmail}
        userFormat={userFormat}
        onClearData={handleClearData}
        onLogout={handleLogout}
      />
      <Preview cards={cards} settings={settings} />
    </>
  )
}

export default App
