import { useState, useCallback } from 'react'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import Preview from './components/Preview.jsx'
import { DEFAULT_SETTINGS } from './lib/defaults.js'

function App() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('auth') === 'true')
  const [userEmail, setUserEmail] = useState(() => sessionStorage.getItem('userEmail') || '')
  const [cards, setCards] = useState([])
  const [allCards, setAllCards] = useState([])
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

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
