import { test } from 'node:test'
import assert from 'node:assert/strict'

import { GENRES } from '../src/lib/genres.js'
import { INPUT_SOURCES } from '../src/lib/inputSources.js'
import {
  applyImportedWorkspace,
  clearActiveWorkspaceGenre,
  clearInputWorkspace,
  createEmptyInputWorkspace,
  hydrateInputWorkspace,
} from '../src/lib/inputModeState.js'

const PAWAN_KEYS = GENRES.map(({ key }) => key)

function card(id, extra = {}) {
  return { id, name: id, basePrice: 1000, ...extra }
}

function genre(allCards = [], selected = [], extra = {}) {
  return {
    allCards,
    selected,
    sheetUrl: extra.sheetUrl ?? '',
    loadedAt: extra.loadedAt ?? null,
  }
}

function workspace(inputSource, genres, activeGenre = 'pokemon') {
  return {
    inputSource,
    visibleGenreKeys: inputSource === INPUT_SOURCES.VAULT ? PAWAN_KEYS : [activeGenre],
    activeGenre,
    genreData: genres,
  }
}

function filledPawanWorkspace() {
  return workspace(
    INPUT_SOURCES.VAULT,
    Object.fromEntries(PAWAN_KEYS.map(key => [
      key,
      genre([card(`old-${key}`)], [card(`old-selected-${key}`, { priceManual: true, price: 9999 })], {
        sheetUrl: `excel:vault:old-${key}.xlsx`,
        loadedAt: 100,
      }),
    ])),
    'weiss',
  )
}

function pawanResult(nonEmpty = {}) {
  return Object.fromEntries(PAWAN_KEYS.map(key => {
    const cards = nonEmpty[key] || []
    return [key, { cards, total: cards.length }]
  }))
}

test('パワン5ジャンル状態からとんとんポケモンを取込むと、旧データを全消去してポケモンだけを表示する', () => {
  const next = applyImportedWorkspace(
    filledPawanWorkspace(),
    INPUT_SOURCES.TONTON,
    { pokemon: { cards: [card('tonton-pikachu')], total: 1 } },
    { sheetUrl: 'excel:tonton:pokemon.xlsx', loadedAt: 200 },
  )

  assert.equal(next.inputSource, INPUT_SOURCES.TONTON)
  assert.deepEqual(next.visibleGenreKeys, ['pokemon'])
  assert.equal(next.activeGenre, 'pokemon')
  assert.deepEqual(next.genreData.pokemon.allCards.map(({ id }) => id), ['tonton-pikachu'])
  assert.deepEqual(next.genreData.pokemon.selected, [])
  assert.equal(next.genreData.pokemon.sheetUrl, 'excel:tonton:pokemon.xlsx')
  for (const key of PAWAN_KEYS.filter(key => key !== 'pokemon')) {
    assert.deepEqual(next.genreData[key].allCards, [], `${key} の旧カードを残さない`)
    assert.deepEqual(next.genreData[key].selected, [], `${key} の旧選択を残さない`)
    assert.equal(next.genreData[key].sheetUrl, '', `${key} の旧Excel情報を残さない`)
    assert.equal(next.genreData[key].loadedAt, null, `${key} の旧読込時刻を残さない`)
  }
})

test('とんとんワンピース状態からパワンを取込むと、全5ジャンルだけを表示し最初の非空ジャンルを開く', () => {
  const previous = workspace(INPUT_SOURCES.TONTON, {
    ...Object.fromEntries(PAWAN_KEYS.map(key => [key, genre()])),
    onepiece: genre([card('tonton-luffy')], [card('tonton-selected-luffy', { priceManual: true })], {
      sheetUrl: 'excel:tonton:onepiece.xlsx',
      loadedAt: 101,
    }),
  }, 'onepiece')
  const next = applyImportedWorkspace(
    previous,
    INPUT_SOURCES.VAULT,
    pawanResult({ yugioh: [card('pawan-yugi')], weiss: [card('pawan-weiss')] }),
    { sheetUrl: 'excel:vault:today.xlsx', loadedAt: 202 },
  )

  assert.equal(next.inputSource, INPUT_SOURCES.VAULT)
  assert.deepEqual(next.visibleGenreKeys, PAWAN_KEYS)
  assert.equal(next.activeGenre, 'yugioh')
  assert.deepEqual(next.genreData.onepiece.allCards, [])
  assert.deepEqual(next.genreData.onepiece.selected, [])
  assert.equal(next.genreData.onepiece.sheetUrl, '')
  assert.deepEqual(next.genreData.yugioh.allCards.map(({ id }) => id), ['pawan-yugi'])
  assert.deepEqual(next.genreData.weiss.allCards.map(({ id }) => id), ['pawan-weiss'])
  for (const key of ['pokemon', 'pokemon_old', 'onepiece']) {
    assert.deepEqual(next.genreData[key].selected, [], `${key} は空の今回データで置換する`)
  }
})

test('同じ形式を再取込しても、前回の選択状態・手入力価格・読込情報を残さない', () => {
  const previous = workspace(INPUT_SOURCES.TONTON, {
    ...Object.fromEntries(PAWAN_KEYS.map(key => [key, genre()])),
    pokemon: genre(
      [card('old-pikachu', { priceManual: true, price: 12345 })],
      [card('old-pikachu', { priceManual: true, price: 12345 })],
      { sheetUrl: 'excel:tonton:old.xlsx', loadedAt: 100 },
    ),
  })
  const next = applyImportedWorkspace(
    previous,
    INPUT_SOURCES.TONTON,
    { pokemon: { cards: [card('new-pikachu')], total: 1 } },
    { sheetUrl: 'excel:tonton:new.xlsx', loadedAt: 200 },
  )

  assert.deepEqual(next.genreData.pokemon.allCards, [card('new-pikachu')])
  assert.deepEqual(next.genreData.pokemon.selected, [])
  assert.equal(next.genreData.pokemon.allCards[0].priceManual, undefined)
  assert.equal(next.genreData.pokemon.sheetUrl, 'excel:tonton:new.xlsx')
  assert.equal(next.genreData.pokemon.loadedAt, 200)
})

test('復元時はモードと一致しないジャンルを除去し、見えないアクティブタブを可視ジャンルへ戻す', () => {
  const restored = hydrateInputWorkspace({
    inputSource: INPUT_SOURCES.TONTON,
    visibleGenreKeys: PAWAN_KEYS,
    activeGenre: 'weiss',
    genreData: {
      pokemon: genre([card('tonton-pikachu')], [card('tonton-pikachu')], { sheetUrl: 'excel:tonton.xlsx', loadedAt: 1 }),
      weiss: genre([card('stale-weiss')], [card('stale-weiss')], { sheetUrl: 'excel:vault.xlsx', loadedAt: 2 }),
    },
  })

  assert.equal(restored.inputSource, INPUT_SOURCES.TONTON)
  assert.deepEqual(restored.visibleGenreKeys, ['pokemon'])
  assert.equal(restored.activeGenre, 'pokemon')
  assert.deepEqual(restored.genreData.pokemon.allCards.map(({ id }) => id), ['tonton-pikachu'])
  for (const key of PAWAN_KEYS.filter(key => key !== 'pokemon')) {
    assert.deepEqual(restored.genreData[key].allCards, [], `${key} を復元しない`)
    assert.deepEqual(restored.genreData[key].selected, [], `${key} の選択を復元しない`)
  }
})

test('ワークスペース全消去は現在形式の可視タブを保ちつつ、全ジャンルの入力データを消去する', () => {
  const cleared = clearInputWorkspace(filledPawanWorkspace())

  assert.equal(cleared.inputSource, INPUT_SOURCES.VAULT)
  assert.deepEqual(cleared.visibleGenreKeys, PAWAN_KEYS)
  assert.equal(cleared.activeGenre, 'weiss')
  for (const key of PAWAN_KEYS) {
    assert.deepEqual(cleared.genreData[key].allCards, [])
    assert.deepEqual(cleared.genreData[key].selected, [])
    assert.equal(cleared.genreData[key].sheetUrl, '')
    assert.equal(cleared.genreData[key].loadedAt, null)
  }
})

test('アクティブジャンルのクリアはパワンの他ジャンルを消さず、とんとんでは唯一の表示タブを保つ', () => {
  const pawan = filledPawanWorkspace()
  const pawanCleared = clearActiveWorkspaceGenre(pawan, 'yugioh')
  assert.deepEqual(pawanCleared.genreData.yugioh.allCards, [])
  assert.deepEqual(pawanCleared.genreData.yugioh.selected, [])
  assert.deepEqual(pawanCleared.genreData.weiss.allCards.map(({ id }) => id), ['old-weiss'])
  assert.deepEqual(pawanCleared.visibleGenreKeys, PAWAN_KEYS)

  const tonton = applyImportedWorkspace(
    createEmptyInputWorkspace(),
    INPUT_SOURCES.TONTON,
    { onepiece: { cards: [card('tonton-luffy')], total: 1 } },
    { sheetUrl: 'excel:tonton:onepiece.xlsx', loadedAt: 1 },
  )
  const tontonCleared = clearActiveWorkspaceGenre(tonton, 'onepiece')
  assert.deepEqual(tontonCleared.visibleGenreKeys, ['onepiece'])
  assert.equal(tontonCleared.activeGenre, 'onepiece')
  assert.deepEqual(tontonCleared.genreData.onepiece.allCards, [])
  assert.deepEqual(tontonCleared.genreData.onepiece.selected, [])
})

test('旧保存形式が混在していても、最後に読み込んだ入力形式だけを復元する', () => {
  const restored = hydrateInputWorkspace({
    pokemon: genre([card('old-pawan-pikachu')], [card('old-pawan-pikachu')], {
      sheetUrl: 'excel:vault:old.xlsx',
      loadedAt: 100,
    }),
    onepiece: genre([card('new-tonton-luffy')], [card('new-tonton-luffy')], {
      sheetUrl: 'excel:tonton:new.xlsx',
      loadedAt: 200,
    }),
    weiss: genre([card('stale-pawan-weiss')], [card('stale-pawan-weiss')], {
      sheetUrl: 'excel:vault:old.xlsx',
      loadedAt: 100,
    }),
  })

  assert.equal(restored.inputSource, INPUT_SOURCES.TONTON)
  assert.deepEqual(restored.visibleGenreKeys, ['onepiece'])
  assert.equal(restored.activeGenre, 'onepiece')
  assert.deepEqual(restored.genreData.onepiece.allCards.map(({ id }) => id), ['new-tonton-luffy'])
  assert.deepEqual(restored.genreData.pokemon.allCards, [])
  assert.deepEqual(restored.genreData.weiss.selected, [])
})

test('新規・壊れた保存値は空のとんとんワークスペースとして安全に開く', () => {
  for (const raw of [null, undefined, 'broken', { inputSource: 'unknown', genreData: null }]) {
    const restored = hydrateInputWorkspace(raw)
    assert.equal(restored.inputSource, INPUT_SOURCES.TONTON)
    assert.deepEqual(restored.visibleGenreKeys, ['pokemon'])
    assert.equal(restored.activeGenre, 'pokemon')
    assert.deepEqual(restored.genreData.pokemon.allCards, [])
  }
})

test('とんとんの表示ジャンルをクリアしても、他ジャンルの古いカードは復活しない', () => {
  const restored = hydrateInputWorkspace({
    inputSource: INPUT_SOURCES.TONTON,
    visibleGenreKeys: ['onepiece'],
    activeGenre: 'onepiece',
    genreData: {
      pokemon: genre([card('stale-pokemon')], [card('stale-pokemon')]),
      onepiece: genre(),
    },
  })

  assert.equal(restored.activeGenre, 'onepiece')
  assert.deepEqual(restored.visibleGenreKeys, ['onepiece'])
  assert.deepEqual(restored.genreData.onepiece.allCards, [])
  assert.deepEqual(restored.genreData.pokemon.allCards, [])
})

test('保存済みのとんとん表示ジャンルとactiveが矛盾しても、表示ジャンル側を優先する', () => {
  const restored = hydrateInputWorkspace({
    inputSource: INPUT_SOURCES.TONTON,
    visibleGenreKeys: ['onepiece'],
    activeGenre: 'pokemon',
    genreData: {
      pokemon: genre(),
      onepiece: genre([card('saved-luffy')], [card('saved-luffy')]),
    },
  })

  assert.equal(restored.activeGenre, 'onepiece')
  assert.deepEqual(restored.visibleGenreKeys, ['onepiece'])
  assert.deepEqual(restored.genreData.onepiece.allCards.map(({ id }) => id), ['saved-luffy'])
})

test('形式マーカーのない旧単一ジャンル保存は、パワン機能を開かずとんとん1タブで復元する', () => {
  const restored = hydrateInputWorkspace({
    pokemon: genre([card('legacy-pikachu')], [card('legacy-pikachu')], {
      sheetUrl: 'https://docs.google.com/spreadsheets/example',
      loadedAt: 10,
    }),
  })

  assert.equal(restored.inputSource, INPUT_SOURCES.TONTON)
  assert.deepEqual(restored.visibleGenreKeys, ['pokemon'])
  assert.equal(restored.activeGenre, 'pokemon')
  assert.deepEqual(restored.genreData.pokemon.allCards.map(({ id }) => id), ['legacy-pikachu'])
})
