import { GENRES } from './genres.js'
import { INPUT_SOURCES } from './inputSources.js'

const GENRE_KEYS = GENRES.map(({ key }) => key)
const GENRE_KEY_SET = new Set(GENRE_KEYS)
const TONTON_GENRE_KEYS = ['pokemon', 'onepiece']
const TONTON_GENRE_KEY_SET = new Set(TONTON_GENRE_KEYS)

function emptyGenre() {
  return { allCards: [], selected: [], sheetUrl: '', loadedAt: null }
}

export function createEmptyGenreData() {
  return Object.fromEntries(GENRE_KEYS.map(key => [key, emptyGenre()]))
}

function isKnownInputSource(value) {
  return value === INPUT_SOURCES.TONTON || value === INPUT_SOURCES.VAULT
}

function visibleKeysFor(inputSource, activeGenre) {
  return inputSource === INPUT_SOURCES.VAULT ? [...GENRE_KEYS] : [activeGenre]
}

function defaultActiveGenre(inputSource, candidate) {
  if (inputSource === INPUT_SOURCES.VAULT) {
    return GENRE_KEY_SET.has(candidate) ? candidate : GENRE_KEYS[0]
  }
  return TONTON_GENRE_KEY_SET.has(candidate) ? candidate : TONTON_GENRE_KEYS[0]
}

export function createEmptyInputWorkspace(inputSource = INPUT_SOURCES.TONTON, activeGenre) {
  const normalizedSource = isKnownInputSource(inputSource) ? inputSource : INPUT_SOURCES.TONTON
  const normalizedActive = defaultActiveGenre(normalizedSource, activeGenre)
  return {
    inputSource: normalizedSource,
    visibleGenreKeys: visibleKeysFor(normalizedSource, normalizedActive),
    activeGenre: normalizedActive,
    genreData: createEmptyGenreData(),
  }
}

function normalizeCardLists(value) {
  const allCards = Array.isArray(value?.allCards)
    ? value.allCards.filter(card => card && card.id != null)
    : []
  const seen = new Set()
  const selected = (Array.isArray(value?.selected) ? value.selected : [])
    .filter(card => card && card.id != null && !seen.has(card.id) && seen.add(card.id))

  return {
    ...emptyGenre(),
    ...(value && typeof value === 'object' ? value : {}),
    allCards,
    selected,
    sheetUrl: typeof value?.sheetUrl === 'string' ? value.sheetUrl : '',
    loadedAt: value?.loadedAt != null && Number.isFinite(Number(value.loadedAt))
      ? Number(value.loadedAt)
      : null,
  }
}

function normalizeGenreData(value) {
  const data = createEmptyGenreData()
  for (const key of GENRE_KEYS) data[key] = normalizeCardLists(value?.[key])
  return data
}

function hasGenreData(value) {
  return value.allCards.length > 0 || value.selected.length > 0 || value.sheetUrl
}

function sourceFromSheetUrl(sheetUrl) {
  if (sheetUrl.startsWith('excel:tonton:')) return INPUT_SOURCES.TONTON
  if (sheetUrl.startsWith('excel:vault:') || sheetUrl.startsWith('excel-single:')) return INPUT_SOURCES.VAULT
  return null
}

function inferLegacyWorkspace(raw) {
  const genreData = normalizeGenreData(raw)
  const candidates = GENRE_KEYS.flatMap((key, index) => {
    const source = sourceFromSheetUrl(genreData[key].sheetUrl)
    if (!source) return []
    return [{ source, key, loadedAt: genreData[key].loadedAt ?? 0, index }]
  }).sort((a, b) => (b.loadedAt - a.loadedAt) || (b.index - a.index))

  const latest = candidates[0]
  if (latest?.source === INPUT_SOURCES.TONTON) {
    const activeGenre = TONTON_GENRE_KEY_SET.has(latest.key) ? latest.key : TONTON_GENRE_KEYS[0]
    const next = createEmptyInputWorkspace(INPUT_SOURCES.TONTON, activeGenre)
    next.genreData[activeGenre] = genreData[activeGenre]
    return next
  }

  if (latest?.source === INPUT_SOURCES.VAULT || GENRE_KEYS.some(key => hasGenreData(genreData[key]))) {
    const populatedKeys = GENRE_KEYS.filter(key => hasGenreData(genreData[key]))
    if (!latest && populatedKeys.length === 1 && TONTON_GENRE_KEY_SET.has(populatedKeys[0])) {
      const activeGenre = populatedKeys[0]
      const next = createEmptyInputWorkspace(INPUT_SOURCES.TONTON, activeGenre)
      next.genreData[activeGenre] = genreData[activeGenre]
      return next
    }

    const firstWithData = populatedKeys[0] || GENRE_KEYS[0]
    return {
      ...createEmptyInputWorkspace(INPUT_SOURCES.VAULT, firstWithData),
      genreData,
    }
  }

  return createEmptyInputWorkspace()
}

export function hydrateInputWorkspace(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createEmptyInputWorkspace()

  // v2以降は入力形式とカードデータを同じペイロードで保存する。
  if ('genreData' in raw || 'inputSource' in raw) {
    if (!isKnownInputSource(raw.inputSource) || !raw.genreData || typeof raw.genreData !== 'object') {
      return createEmptyInputWorkspace()
    }

    const genreData = normalizeGenreData(raw.genreData)
    if (raw.inputSource === INPUT_SOURCES.TONTON) {
      const visibleGenre = (Array.isArray(raw.visibleGenreKeys) ? raw.visibleGenreKeys : [])
        .find(key => TONTON_GENRE_KEY_SET.has(key))
      const activeGenre = visibleGenre
        || (TONTON_GENRE_KEY_SET.has(raw.activeGenre) ? raw.activeGenre : null)
        || TONTON_GENRE_KEYS.find(key => hasGenreData(genreData[key]))
        || TONTON_GENRE_KEYS[0]
      const next = createEmptyInputWorkspace(INPUT_SOURCES.TONTON, activeGenre)
      next.genreData[activeGenre] = genreData[activeGenre]
      return next
    }

    const activeGenre = GENRE_KEY_SET.has(raw.activeGenre)
      ? raw.activeGenre
      : GENRE_KEYS.find(key => hasGenreData(genreData[key])) || GENRE_KEYS[0]
    return {
      ...createEmptyInputWorkspace(INPUT_SOURCES.VAULT, activeGenre),
      genreData,
    }
  }

  // 旧形式は5ジャンルのデータだけだったため、最新の読込マーカーから形式を復元する。
  return inferLegacyWorkspace(raw)
}

function importedCards(result, transformCard) {
  if (!Array.isArray(result?.cards)) return []
  return result.cards.map(card => transformCard(card))
}

export function applyImportedWorkspace(
  _previous,
  inputSource,
  result,
  { sheetUrl = '', loadedAt = Date.now(), transformCard = card => card } = {},
) {
  if (!isKnownInputSource(inputSource)) throw new Error(`未対応の入力タイプです: ${inputSource}`)

  if (inputSource === INPUT_SOURCES.TONTON) {
    const activeGenre = TONTON_GENRE_KEYS.find(key => Array.isArray(result?.[key]?.cards))
    if (!activeGenre) throw new Error('とんとん形式の対象ジャンルを読み取れませんでした')
    const next = createEmptyInputWorkspace(inputSource, activeGenre)
    const cards = importedCards(result[activeGenre], transformCard)
    next.genreData[activeGenre] = {
      allCards: cards,
      selected: [],
      sheetUrl: cards.length > 0 ? sheetUrl : '',
      loadedAt: cards.length > 0 ? loadedAt : null,
    }
    return next
  }

  const next = createEmptyInputWorkspace(INPUT_SOURCES.VAULT)
  for (const key of GENRE_KEYS) {
    const cards = importedCards(result?.[key], transformCard)
    next.genreData[key] = {
      allCards: cards,
      selected: [],
      sheetUrl: cards.length > 0 ? sheetUrl : '',
      loadedAt: cards.length > 0 ? loadedAt : null,
    }
  }
  next.activeGenre = GENRE_KEYS.find(key => next.genreData[key].allCards.length > 0) || GENRE_KEYS[0]
  return next
}

export function clearInputWorkspace(workspace) {
  const source = isKnownInputSource(workspace?.inputSource) ? workspace.inputSource : INPUT_SOURCES.TONTON
  return createEmptyInputWorkspace(source, workspace?.activeGenre)
}

export function clearActiveWorkspaceGenre(workspace, genreKey = workspace?.activeGenre) {
  const current = hydrateInputWorkspace(workspace)
  if (!current.visibleGenreKeys.includes(genreKey)) return current
  return {
    ...current,
    genreData: {
      ...current.genreData,
      [genreKey]: emptyGenre(),
    },
  }
}

export function replaceWorkspaceGenre(
  workspace,
  genreKey,
  cards,
  { sheetUrl = '', loadedAt = Date.now(), transformCard = card => card } = {},
) {
  const current = hydrateInputWorkspace(workspace)
  if (current.inputSource !== INPUT_SOURCES.VAULT || !GENRE_KEY_SET.has(genreKey)) return current
  const nextCards = (Array.isArray(cards) ? cards : []).map(card => transformCard(card))
  return {
    ...current,
    activeGenre: genreKey,
    genreData: {
      ...current.genreData,
      [genreKey]: {
        allCards: nextCards,
        selected: [],
        sheetUrl: nextCards.length > 0 ? sheetUrl : '',
        loadedAt: nextCards.length > 0 ? loadedAt : null,
      },
    },
  }
}

export function setWorkspaceActiveGenre(workspace, genreKey) {
  if (!workspace?.visibleGenreKeys?.includes(genreKey)) return workspace
  return { ...workspace, activeGenre: genreKey }
}
