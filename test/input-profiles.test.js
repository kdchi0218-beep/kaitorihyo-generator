import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'

import {
  INPUT_SOURCES,
  INPUT_SOURCE_OPTIONS,
  normalizeInputSource,
  parseInputFile,
} from '../src/lib/inputSources.js'
import {
  detectTontonGenre,
  parseTontonRows,
} from '../src/lib/tontonParser.js'

const writeFile = (workbook) => {
  const arrayBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return { arrayBuffer: async () => arrayBuffer }
}

test('とんとん総合版: とんとん形式を第一選択肢にする', () => {
  assert.equal(INPUT_SOURCE_OPTIONS[0].value, INPUT_SOURCES.TONTON)
  assert.equal(INPUT_SOURCE_OPTIONS[1].value, INPUT_SOURCES.VAULT)
})

test('とんとん総合版: 保存値が不正な場合はとんとん形式へ戻す', () => {
  assert.equal(normalizeInputSource(INPUT_SOURCES.VAULT), INPUT_SOURCES.VAULT)
  assert.equal(normalizeInputSource('tampered'), INPUT_SOURCES.TONTON)
  assert.equal(normalizeInputSource(null), INPUT_SOURCES.TONTON)
})

test('とんとん形式: ポケモンの1シートを共通カードモデルへ正規化する', () => {
  const rows = [
    ['ジャンル', 'ボックス名', 'カード番号', 'カード名', 'レアリティ', '種別', '買取価格', 'カード画像URL'],
    ['ポケモン', '拡張パックA', '001/100', 'ピカチュウ', 'SAR', 'PSA10', '12,345', 'https://img.example/pikachu.jpg'],
  ]

  const result = parseTontonRows(rows, { sheetName: 'ポケモン買取表' })

  assert.equal(result.genreKey, 'pokemon')
  assert.equal(result.cards.length, 1)
  assert.deepEqual(result.cards[0], {
    id: 'tonton_pokemon_001/100_1',
    productId: '',
    genre: 'pokemon',
    gameType: 'pokemon',
    name: 'ピカチュウ',
    listNo: '001/100',
    type: 'PSA10',
    expansion: '拡張パックA',
    rarity: 'SAR',
    imageUrl: 'https://img.example/pikachu.jpg',
    reqCount: 0,
    basePrice: 12345,
    tag: '拡張パックA SAR PSA10',
    selected: false,
    sourceType: 'tonton',
  })
})

test('とんとん形式: ワンピースはカード番号からも判定できる', () => {
  const rows = [
    ['カードタイプ', 'カラー', 'ボックス名', 'カード番号', 'カード名', 'レアリティ', '種別', '買取価格', 'カード画像URL'],
    ['リーダー', '赤', 'OP-01', 'OP01-001', 'モンキー・D・ルフィ', 'L', '素体', 5000, ''],
  ]

  assert.equal(detectTontonGenre(rows, '取込データ'), 'onepiece')
  const result = parseTontonRows(rows, { sheetName: '取込データ' })
  assert.equal(result.genreKey, 'onepiece')
  assert.equal(result.cards[0].basePrice, 5000)
  assert.equal(result.cards[0].imageUrl, null)
})

test('とんとん形式: 商品IDがあれば安定IDとして優先する', () => {
  const rows = [
    ['商品ID', 'ジャンル', 'カード番号', 'カード名', '種別', '買取価格'],
    ['PKM-00001', 'ポケモン', '001', 'ミュウ', '素体', 3000],
  ]

  const result = parseTontonRows(rows, { sheetName: 'ポケモン' })
  assert.equal(result.cards[0].id, 'PKM-00001')
  assert.equal(result.cards[0].productId, 'PKM-00001')
})

test('とんとん形式: カード名列が無い場合は明示的に失敗する', () => {
  assert.throws(
    () => parseTontonRows([['カード番号', '買取価格'], ['001', 1000]], { sheetName: 'ポケモン' }),
    /カード名/,
  )
})

test('入力切替: とんとん形式のExcelは該当ジャンルだけを返す', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ジャンル', 'ボックス名', 'カード番号', 'カード名', 'レアリティ', '種別', '買取価格', 'カード画像URL'],
    ['ポケモン', 'BOX-A', '001', 'ピカチュウ', 'SAR', 'PSA10', 10000, 'https://img.example/1.jpg'],
  ]), 'ポケモン')

  const result = await parseInputFile(writeFile(workbook), INPUT_SOURCES.TONTON)
  assert.deepEqual(Object.keys(result), ['pokemon'])
  assert.equal(result.pokemon.total, 1)
  assert.equal(result.pokemon.inputSource, INPUT_SOURCES.TONTON)
})

test('入力切替: Vault形式は既存の5ジャンル一括取込を維持する', async () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['ガチャ選択肢名称', '種別', 'list_no', '画像', '仕入れ依頼数', '納品希望価格'],
    ['ピカチュウ', 'PSA10', '001', '', 1, 10000],
  ]), 'ポケモン')

  const result = await parseInputFile(writeFile(workbook), INPUT_SOURCES.VAULT)
  assert.equal(result.pokemon.cards.length, 1)
  assert.equal(result.pokemon.inputSource, INPUT_SOURCES.VAULT)
  assert.equal(result.onepiece.notFound, true)
})

test('入力切替: 未知の入力タイプは受け付けない', async () => {
  await assert.rejects(
    () => parseInputFile({ arrayBuffer: async () => new ArrayBuffer(0) }, 'unknown'),
    /未対応の入力タイプ/,
  )
})
