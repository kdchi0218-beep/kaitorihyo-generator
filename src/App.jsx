import { useState, useCallback, useEffect } from 'react'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import Preview from './components/Preview.jsx'
import { DEFAULT_SETTINGS } from './lib/defaults.js'

const STORAGE_KEYS = {
  cards: 'kaitori_cards',
  allCards: 'kaitori_allCards',
  settings: 'kaitori_settings',
}

function loadFromStorage(key, fallback) {
  try {
    const data = sessionStorage.getItem(key)
    return data ? JSON.parse(data) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('auth') === 'true')
  const [userEmail, setUserEmail] = useState(() => sessionStorage.getItem('userEmail') || '')
  const [cards, setCards] = useState(() => loadFromStorage(STORAGE_KEYS.cards, []))
  const [allCards, setAllCards] = useState(() => loadFromStorage(STORAGE_KEYS.allCards, []))
  const [settings, setSettings] = useState(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS))

  // 変更時に自動保存
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(cards))
  }, [cards])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEYS.allCards, JSON.stringify(allCards))
  }, [allCards])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
  }, [settings])

  const updateSettings = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  if (!authed) {
    return <Login onLogin={(email) => { setAuthed(true); setUserEmail(email) }} />
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
      />
      <Preview cards={cards} settings={settings} />
    </>
  )
}

export default App
