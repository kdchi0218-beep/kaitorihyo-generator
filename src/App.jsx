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
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : fallback
  } catch {
    return fallback
  }
}

function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('auth') === 'true')
  const [userEmail, setUserEmail] = useState(() => localStorage.getItem('userEmail') || '')
  const [cards, setCards] = useState(() => loadFromStorage(STORAGE_KEYS.cards, []))
  const [allCards, setAllCards] = useState(() => loadFromStorage(STORAGE_KEYS.allCards, []))
  const [settings, setSettings] = useState(() => loadFromStorage(STORAGE_KEYS.settings, DEFAULT_SETTINGS))

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(cards))
  }, [cards])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.allCards, JSON.stringify(allCards))
  }, [allCards])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings))
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
    localStorage.removeItem(STORAGE_KEYS.cards)
    localStorage.removeItem(STORAGE_KEYS.allCards)
    localStorage.removeItem(STORAGE_KEYS.settings)
    setAuthed(false)
    setUserEmail('')
  }

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
        onClearData={handleClearData}
        onLogout={handleLogout}
      />
      <Preview cards={cards} settings={settings} />
    </>
  )
}

export default App
