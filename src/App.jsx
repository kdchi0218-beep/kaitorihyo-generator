import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import Login from './components/Login.jsx'
import Sidebar from './components/Sidebar.jsx'
import Preview from './components/Preview.jsx'
import AdminPanel from './components/AdminPanel.jsx'
import { DEFAULT_SETTINGS } from './lib/defaults.js'
import { GENRES, GENRE_BY_KEY } from './lib/genres.js'
import { computeDisplayPrice } from './lib/pricing.js'
import { authApi } from './lib/authApi.js'
import { checkIsAdmin, listMyStores, listAllStores, loadStoreSettings, saveStoreSettings } from './lib/storeSync.js'
import { mergePersistedAssetUrls } from './lib/settingsAssets.js'
import { createSettingsSaveQueue } from './lib/settingsSaveQueue.js'
import { INPUT_SOURCES, normalizeInputSource } from './lib/inputSources.js'
import {
  applyImportedWorkspaceToProfile,
  clearActiveWorkspaceGenre,
  createInputModeProfiles,
  getSelectedInputWorkspace,
  hydrateInputModeProfiles,
  replaceWorkspaceGenre,
  selectInputModeProfile,
  setWorkspaceActiveGenre,
  updateSelectedInputWorkspace,
} from './lib/inputModeState.js'

// 価格設定を全カードに反映して price を再計算
// 手動で価格入力したカード（priceManual）は上書きしない
function recomputePrices(genreData, pricing) {
  const out = {}
  for (const [key, gd] of Object.entries(genreData)) {
    const apply = (list) => list.map(c => c.priceManual ? c : ({ ...c, price: computeDisplayPrice(c.basePrice, pricing) }))
    out[key] = { ...gd, allCards: apply(gd.allCards), selected: apply(gd.selected) }
  }
  return out
}

// 開きっぱなしのタブが古いコードのまま動き続けるのを防ぐ:
// version.json を定期確認し、新ビルドが出ていたら更新バナーを出す
function useNewVersionAvailable() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const r = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!r.ok) return
        const { id } = await r.json()
        if (!stopped && id && typeof __BUILD_ID__ !== 'undefined' && id !== __BUILD_ID__) setAvailable(true)
      } catch { /* オフライン等は無視 */ }
    }
    check()
    const t = setInterval(check, 5 * 60 * 1000)
    const onFocus = () => check()
    window.addEventListener('focus', onFocus)
    return () => { stopped = true; clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])
  return available
}

function UpdateBanner() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#1e3a5f', color: '#fff', fontSize: 12,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '6px 12px',
    }}>
      <span>新しいバージョンがあります。更新すると不具合修正が反映されます。</span>
      <button
        onClick={() => window.location.reload()}
        style={{ background: '#ffd700', color: '#1e3a5f', border: 'none', borderRadius: 4, padding: '3px 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
      >今すぐ更新</button>
    </div>
  )
}

function Loading({ text = '読み込み中...' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', color: '#8c95a4', fontSize: 14 }}>
      {text}
    </div>
  )
}

function NoStore({ userEmail, onLogout }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100vw', gap: 12 }}>
      <p style={{ color: '#5a6577', fontSize: 14 }}>この店舗アカウントにはまだ店舗が割り当てられていません。</p>
      <p style={{ color: '#8c95a4', fontSize: 12 }}>管理者にお問い合わせください（{userEmail}）</p>
      <button onClick={onLogout} style={{ marginTop: 8, fontSize: 12, color: '#8c95a4', cursor: 'pointer', background: 'none', border: 'none' }}>ログアウト</button>
    </div>
  )
}

function App() {
  const newVersionAvailable = useNewVersionAvailable()

  // ---- 認証 ----
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  useEffect(() => {
    let active = true
    authApi.getSession()
      .then(value => { if (active) setSession(value) })
      .catch(() => { if (active) setSession(null) })
      .finally(() => { if (active) setAuthLoading(false) })
    const invalidate = () => setSession(null)
    window.addEventListener('tonton-auth-invalid', invalidate)
    return () => { active = false; window.removeEventListener('tonton-auth-invalid', invalidate) }
  }, [])
  const authed = !!session
  const userEmail = session?.user?.email || ''

  // ---- 店舗 ----
  const [stores, setStores] = useState([])
  const [allStores, setAllStores] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [storesLoading, setStoresLoading] = useState(true)
  const [activeStoreId, setActiveStoreId] = useState(null)
  const [showAdmin, setShowAdmin] = useState(false)

  // サイドバー幅（ドラッグでリサイズ可能）
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const v = Number(localStorage.getItem('tonton_sidebarW'))
    return v >= 320 && v <= 1000 ? v : 440
  })
  useEffect(() => { localStorage.setItem('tonton_sidebarW', String(sidebarWidth)) }, [sidebarWidth])

  const startResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    const onMove = (ev) => {
      const w = Math.max(320, Math.min(1000, startW + (ev.clientX - startX)))
      setSidebarWidth(w)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [sidebarWidth])

  const refreshStores = useCallback(async () => {
    const [admin, list, all] = await Promise.all([checkIsAdmin(), listMyStores(), listAllStores().catch(() => [])])
    setIsAdmin(admin)
    setStores(list)
    setAllStores(all)
    setActiveStoreId(prev => {
      if (prev && list.find(s => s.id === prev)) return prev
      const saved = localStorage.getItem('tonton_activeStore')
      return (list.find(s => s.id === saved) || list[0])?.id || null
    })
    return { admin, list }
  }, [])

  useEffect(() => {
    if (!session) { setStoresLoading(true); return }
    setStoresLoading(true)
    refreshStores().finally(() => setStoresLoading(false))
  }, [session, refreshStores])

  // ---- 設定（店舗ごと・クラウド同期） ----
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const skipSaveRef = useRef(true)
  const activeStoreIdRef = useRef(activeStoreId)
  const settingsSaveQueueRef = useRef(null)
  activeStoreIdRef.current = activeStoreId
  if (!settingsSaveQueueRef.current) {
    settingsSaveQueueRef.current = createSettingsSaveQueue({
      save: saveStoreSettings,
      onSaved: (savedStoreId, sourceSettings, persistedSettings) => {
        if (activeStoreIdRef.current !== savedStoreId) return
        setSettings(current => mergePersistedAssetUrls(current, sourceSettings, persistedSettings))
      },
      onError: error => console.error('店舗設定の保存に失敗しました', error),
    })
  }

  useEffect(() => {
    if (!activeStoreId) return
    localStorage.setItem('tonton_activeStore', activeStoreId)
    setSettingsLoaded(false)
    skipSaveRef.current = true
    loadStoreSettings(activeStoreId)
      .then(s => { setSettings({ ...DEFAULT_SETTINGS, ...(s || {}) }); setSettingsLoaded(true) })
      .catch(() => { setSettings(DEFAULT_SETTINGS); setSettingsLoaded(true) })
  }, [activeStoreId])

  // 設定変更 → クラウド保存（初回ロードはスキップ・800msデバウンス）
  useEffect(() => {
    if (!activeStoreId || !settingsLoaded) return
    if (skipSaveRef.current) { skipSaveRef.current = false; return }
    const sourceSettings = settings
    const t = setTimeout(() => {
      settingsSaveQueueRef.current.enqueue(activeStoreId, sourceSettings)
    }, 800)
    return () => clearTimeout(t)
  }, [settings, activeStoreId, settingsLoaded])

  const updateSettings = useCallback((key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }))
  }, [])

  // ---- 入力ワークスペース（店舗×入力形式ごと・ローカルキャッシュ） ----
  // とんとんとパワンを別ワークスペースとして保持し、
  // 選択中の入力形式のカードだけを画面に出す。
  const [workspaceState, setWorkspaceState] = useState(() => ({
    storeId: null,
    modeProfiles: createInputModeProfiles(),
  }))

  // 店舗切替でその店のカードをローカルから復元
  // 過去バージョンのバグで壊れた選択状態（重複・null）が残っていても、復元時に必ず浄化する
  useEffect(() => {
    if (!activeStoreId) {
      setWorkspaceState({ storeId: null, modeProfiles: createInputModeProfiles() })
      return
    }
    let restored = createInputModeProfiles()
    try {
      const raw = localStorage.getItem(`tonton_genre_${activeStoreId}`)
      restored = hydrateInputModeProfiles(raw ? JSON.parse(raw) : null)
    } catch { restored = createInputModeProfiles() }
    setWorkspaceState({
      storeId: activeStoreId,
      modeProfiles: restored,
    })
  }, [activeStoreId])

  // 入力形式ごとのカードデータを1つのペイロードで永続。
  // storeIdが復元済みのstateと一致するときだけ保存し、店舗切替直後の前店舗データ誤書込みも防ぐ。
  useEffect(() => {
    if (!activeStoreId || workspaceState.storeId !== activeStoreId) return
    const key = `tonton_genre_${activeStoreId}`
    try { localStorage.setItem(key, JSON.stringify(workspaceState.modeProfiles)) }
    catch {
      // 容量超過: 両形式のカード一覧は次回Excel再取込で復元できるので落とし、選択中は守る
      const slim = {
        ...workspaceState.modeProfiles,
        profiles: Object.fromEntries(Object.entries(workspaceState.modeProfiles.profiles)
          .map(([source, inputWorkspace]) => [source, {
            ...inputWorkspace,
            genreData: Object.fromEntries(Object.entries(inputWorkspace.genreData)
              .map(([genreKey, data]) => [genreKey, { ...data, allCards: [] }])),
          }])),
      }
      try { localStorage.setItem(key, JSON.stringify(slim)) }
      catch (e) { console.error('カードデータのローカル保存に失敗（容量超過）。リロード時はExcelを再取込してください', e) }
    }
  }, [workspaceState.modeProfiles, workspaceState.storeId, activeStoreId])

  const workspaceReady = workspaceState.storeId === activeStoreId
  const modeProfiles = workspaceReady ? workspaceState.modeProfiles : createInputModeProfiles()
  const workspace = getSelectedInputWorkspace(modeProfiles)
  const { genreData, activeGenre, inputSource, visibleGenreKeys } = workspace

  const updateWorkspace = useCallback((updater) => {
    setWorkspaceState(prev => {
      if (prev.storeId !== activeStoreId) return prev
      return { ...prev, modeProfiles: updateSelectedInputWorkspace(prev.modeProfiles, updater) }
    })
  }, [activeStoreId])

  const setInputSource = useCallback((nextSource) => {
    const normalized = normalizeInputSource(nextSource)
    setWorkspaceState(prev => (
      prev.storeId === activeStoreId
        ? { ...prev, modeProfiles: selectInputModeProfile(prev.modeProfiles, normalized) }
        : prev
    ))
  }, [activeStoreId])

  const setActiveGenre = useCallback((genreKey) => {
    updateWorkspace(prev => setWorkspaceActiveGenre(prev, genreKey))
  }, [updateWorkspace])

  // 価格設定が変わったら全カード再計算
  const pricing = useMemo(() => ({
    ratePercent: settings.ratePercent ?? 0,
    flatAdjust: settings.priceFlatAdjust ?? 0,
    tiers: settings.priceTiers ?? [],
    unit: settings.priceUnit ?? 100,
    rounding: settings.priceRounding ?? 'ceil',
  }), [settings.ratePercent, settings.priceFlatAdjust, settings.priceTiers, settings.priceUnit, settings.priceRounding])

  useEffect(() => {
    // 店舗切替直後は設定ロード完了まで再計算しない（前店舗のカードに新店舗の価格設定を誤適用しないため）
    if (!settingsLoaded) return
    updateWorkspace(prev => ({ ...prev, genreData: recomputePrices(prev.genreData, pricing) }))
  }, [pricing, settingsLoaded, updateWorkspace, inputSource])

  // アクティブジャンルのスライス
  const active = genreData[activeGenre] || { allCards: [], selected: [] }

  const setActiveAllCards = useCallback((updater) => {
    updateWorkspace(prev => {
      const cur = prev.genreData[prev.activeGenre]
      const next = typeof updater === 'function' ? updater(cur.allCards) : updater
      return {
        ...prev,
        genreData: { ...prev.genreData, [prev.activeGenre]: { ...cur, allCards: next } },
      }
    })
  }, [updateWorkspace])

  const setActiveSelected = useCallback((updater) => {
    updateWorkspace(prev => {
      const cur = prev.genreData[prev.activeGenre]
      const raw = typeof updater === 'function' ? updater(cur.selected) : updater
      // selectedに同一idが二重に入らないよう常に一意化（増殖防止・登録順は先勝ちで保持）
      const seen = new Set()
      const next = (raw || []).filter(c => (c && c.id != null && !seen.has(c.id)) ? (seen.add(c.id), true) : false)
      return {
        ...prev,
        genreData: { ...prev.genreData, [prev.activeGenre]: { ...cur, selected: next } },
      }
    })
  }, [updateWorkspace])

  // パワン専用の1ジャンル単体取込。パワンワークスペース内でのみ対象ジャンルを置換する。
  const loadGenreCards = useCallback((genreKey, cards, sheetUrl) => {
    updateWorkspace(prev => replaceWorkspaceGenre(prev, genreKey, cards, {
      sheetUrl,
      transformCard: card => ({ ...card, price: computeDisplayPrice(card.basePrice, pricing) }),
    }))
  }, [pricing, updateWorkspace])

  // 全体Excelが正常に解析できた後だけ、対象の入力形式だけを原子的に置き換える。
  const applyInputImport = useCallback(({ inputSource: importedSource, result, sheetUrl }) => {
    setWorkspaceState(prev => {
      if (prev.storeId !== activeStoreId) return prev
      const nextProfiles = applyImportedWorkspaceToProfile(prev.modeProfiles, importedSource, result, {
        sheetUrl,
        transformCard: card => ({ ...card, price: computeDisplayPrice(card.basePrice, pricing) }),
      })
      return { ...prev, modeProfiles: nextProfiles }
    })
  }, [activeStoreId, pricing])

  const handleClearActive = () => {
    updateWorkspace(prev => clearActiveWorkspaceGenre(prev))
  }

  const handleLogout = async () => {
    try { await authApi.logout() } finally {
      setSession(null)
      setStores([])
      setAllStores([])
      setActiveStoreId(null)
    }
  }

  const genreMeta = useMemo(() => {
    const m = {}
    for (const g of GENRES) {
      const gd = genreData[g.key] || { allCards: [], selected: [] }
      m[g.key] = { total: gd.allCards.length, selected: gd.selected.length }
    }
    return m
  }, [genreData])

  // ---- 画面分岐 ----
  if (authLoading) return <Loading />
  if (!authed) return <Login onLogin={value => setSession(value)} />

  if (storesLoading) return <Loading text="店舗を読み込み中..." />

  // 管理画面（管理者が開いた / 管理者で店舗ゼロ）
  if (showAdmin || (isAdmin && stores.length === 0)) {
    return (
      <AdminPanel
        stores={stores}
        onRefresh={refreshStores}
        onClose={() => setShowAdmin(false)}
        canClose={stores.length > 0}
        userEmail={userEmail}
        onLogout={handleLogout}
      />
    )
  }

  // 店舗ユーザーだが所属店舗なし
  if (stores.length === 0) return <NoStore userEmail={userEmail} onLogout={handleLogout} />

  return (
    <>
      {newVersionAvailable && <UpdateBanner />}
      <Sidebar
        width={sidebarWidth}
        stores={stores}
        allStores={allStores}
        isAdmin={isAdmin}
        activeStoreId={activeStoreId}
        setActiveStoreId={setActiveStoreId}
        onOpenAdmin={() => setShowAdmin(true)}
        activeGenre={activeGenre}
        setActiveGenre={setActiveGenre}
        genreMeta={genreMeta}
        visibleGenreKeys={visibleGenreKeys}
        inputSource={inputSource}
        setInputSource={setInputSource}
        applyInputImport={applyInputImport}
        loadGenreCards={loadGenreCards}
        allCards={active.allCards}
        setAllCards={setActiveAllCards}
        cards={active.selected}
        setCards={setActiveSelected}
        settings={settings}
        updateSettings={updateSettings}
        setSettings={setSettings}
        userEmail={userEmail}
        onClearData={handleClearActive}
        onLogout={handleLogout}
      />
      <div
        onMouseDown={startResize}
        title="ドラッグで幅を調整"
        style={{ width: 6, cursor: 'col-resize', flexShrink: 0, background: '#d0d5dd' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#1e3a5f')}
        onMouseLeave={e => (e.currentTarget.style.background = '#d0d5dd')}
      />
      <Preview
        cards={active.selected}
        settings={settings}
        placeholderImage={GENRE_BY_KEY[activeGenre]?.placeholder || './card-back.jpg'}
        setCards={setActiveSelected}
      />
    </>
  )
}

export default App
