import { GENRES } from './genres.js'
import { INPUT_SOURCES } from './inputSources.js'

const GENRE_KEYS = GENRES.map(({ key }) => key)
const GENRE_KEY_SET = new Set(GENRE_KEYS)
const TONTON_GENRE_KEYS = ['pokemon', 'onepiece']
const TONTON_GENRE_KEY_SET = new Set(TONTON_GENRE_KEYS)
// JSONから復元済み、またはこのモジュールの更新関数が返した状態だけを記録する。
// これにより React の描画ごとにカード配列を正規化・複製し直さずに済む。
const RUNTIME_PROFILES = new WeakSet()
const RUNTIME_WORKSPACES = new WeakSet()

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
  return markRuntimeWorkspace({
    inputSource: normalizedSource,
    visibleGenreKeys: visibleKeysFor(normalizedSource, normalizedActive),
    activeGenre: normalizedActive,
    genreData: createEmptyGenreData(),
  })
}

function markRuntimeWorkspace(workspace) {
  RUNTIME_WORKSPACES.add(workspace)
  return workspace
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
    return markRuntimeWorkspace({
      ...createEmptyInputWorkspace(INPUT_SOURCES.VAULT, firstWithData),
      genreData,
    })
  }

  return createEmptyInputWorkspace()
}

export function hydrateInputWorkspace(raw) {
  if (RUNTIME_WORKSPACES.has(raw)) return raw
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
    return markRuntimeWorkspace({
      ...createEmptyInputWorkspace(INPUT_SOURCES.VAULT, activeGenre),
      genreData,
    })
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
  return markRuntimeWorkspace({
    ...current,
    genreData: {
      ...current.genreData,
      [genreKey]: emptyGenre(),
    },
  })
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
  return markRuntimeWorkspace({
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
  })
}

export function setWorkspaceActiveGenre(workspace, genreKey) {
  if (!workspace?.visibleGenreKeys?.includes(genreKey)) return workspace
  if (workspace.activeGenre === genreKey) return workspace
  return markRuntimeWorkspace({ ...workspace, activeGenre: genreKey })
}

// 入力形式ごとの作業データを同一店舗内で並行して保持するための入れ物。
// selectedInputSource は「現在画面に表示している形式」で、profiles 自体は両方を保持する。
export function createInputModeProfiles() {
  return markRuntimeProfiles({
    selectedInputSource: INPUT_SOURCES.TONTON,
    profiles: {
      [INPUT_SOURCES.TONTON]: createEmptyInputWorkspace(INPUT_SOURCES.TONTON),
      [INPUT_SOURCES.VAULT]: createEmptyInputWorkspace(INPUT_SOURCES.VAULT),
    },
  })
}

function markRuntimeProfiles(profiles) {
  RUNTIME_PROFILES.add(profiles)
  return profiles
}

function asRuntimeProfiles(profiles) {
  return RUNTIME_PROFILES.has(profiles) ? profiles : hydrateInputModeProfiles(profiles)
}

function hydrateProfileWorkspace(rawWorkspace, inputSource) {
  if (!rawWorkspace || typeof rawWorkspace !== 'object' || Array.isArray(rawWorkspace)) {
    return createEmptyInputWorkspace(inputSource)
  }

  const workspace = hydrateInputWorkspace(rawWorkspace)
  // 破損した保存値などで別形式のデータが入っていた場合、別プロファイルへ
  // 混入させず安全に空にする。旧単一workspaceの移行は hydrateInputModeProfiles で扱う。
  return workspace.inputSource === inputSource
    ? workspace
    : createEmptyInputWorkspace(inputSource)
}

function looksLikeRuntimeWorkspace(workspace, inputSource) {
  if (!workspace || typeof workspace !== 'object' || Array.isArray(workspace)) return false
  if (workspace.inputSource !== inputSource || !Array.isArray(workspace.visibleGenreKeys)) return false
  if (!workspace.genreData || typeof workspace.genreData !== 'object') return false
  return GENRE_KEYS.every(key => {
    const genre = workspace.genreData[key]
    return genre && Array.isArray(genre.allCards) && Array.isArray(genre.selected)
  })
}

function runtimeWorkspaceOrHydrate(workspace, inputSource) {
  if (RUNTIME_WORKSPACES.has(workspace)) return workspace
  // updater は現在の正規化済みworkspaceから次のstateを作る。ここではカード配列を
  // 複製せず、最低限の形だけ確認して信頼済みruntime stateとして登録する。
  if (looksLikeRuntimeWorkspace(workspace, inputSource)) return markRuntimeWorkspace(workspace)
  return hydrateProfileWorkspace(workspace, inputSource)
}

function isProfilePayload(raw) {
  return Boolean(
    raw
    && typeof raw === 'object'
    && !Array.isArray(raw)
    && raw.profiles
    && typeof raw.profiles === 'object'
    && !Array.isArray(raw.profiles),
  )
}

/**
 * 形式別の保存値を復元する。旧バージョンの単一workspaceは、そのデータの形式側だけへ移す。
 */
export function hydrateInputModeProfiles(raw) {
  if (RUNTIME_PROFILES.has(raw)) return raw

  if (isProfilePayload(raw)) {
    return markRuntimeProfiles({
      selectedInputSource: isKnownInputSource(raw.selectedInputSource)
        ? raw.selectedInputSource
        : INPUT_SOURCES.TONTON,
      profiles: {
        [INPUT_SOURCES.TONTON]: hydrateProfileWorkspace(raw.profiles[INPUT_SOURCES.TONTON], INPUT_SOURCES.TONTON),
        [INPUT_SOURCES.VAULT]: hydrateProfileWorkspace(raw.profiles[INPUT_SOURCES.VAULT], INPUT_SOURCES.VAULT),
      },
    })
  }

  const legacyWorkspace = hydrateInputWorkspace(raw)
  const profiles = createInputModeProfiles()
  profiles.selectedInputSource = legacyWorkspace.inputSource
  profiles.profiles[legacyWorkspace.inputSource] = legacyWorkspace
  return profiles
}

export function selectInputModeProfile(profiles, inputSource) {
  const current = asRuntimeProfiles(profiles)
  if (!isKnownInputSource(inputSource)) return current
  if (current.selectedInputSource === inputSource) return current
  return markRuntimeProfiles({ ...current, selectedInputSource: inputSource })
}

export function getSelectedInputWorkspace(profiles) {
  const current = asRuntimeProfiles(profiles)
  return current.profiles[current.selectedInputSource]
}

/** 選択中の形式だけを書き換え、もう一方の入力データは残す。 */
export function updateSelectedInputWorkspace(profiles, updater) {
  const current = asRuntimeProfiles(profiles)
  if (typeof updater !== 'function') return current
  const inputSource = current.selectedInputSource
  const nextWorkspace = updater(current.profiles[inputSource])
  if (nextWorkspace === current.profiles[inputSource]) return current
  return markRuntimeProfiles({
    ...current,
    profiles: {
      ...current.profiles,
      [inputSource]: runtimeWorkspaceOrHydrate(nextWorkspace, inputSource),
    },
  })
}

/**
 * 正常に解析できた対象形式だけを丸ごと置換する。
 * applyImportedWorkspace が throw する場合は profiles に触れないため、呼出元の状態も不変。
 */
export function applyImportedWorkspaceToProfile(profiles, inputSource, result, options) {
  if (!isKnownInputSource(inputSource)) throw new Error(`未対応の入力タイプです: ${inputSource}`)
  const current = asRuntimeProfiles(profiles)
  const imported = applyImportedWorkspace(current.profiles[inputSource], inputSource, result, options)
  return markRuntimeProfiles({
    ...current,
    selectedInputSource: inputSource,
    profiles: {
      ...current.profiles,
      [inputSource]: imported,
    },
  })
}
