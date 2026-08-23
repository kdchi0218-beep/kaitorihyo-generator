import { parseExcelAllGenres } from './excelSource.js'
import { parseTontonExcel } from './tontonParser.js'

export const INPUT_SOURCES = Object.freeze({
  VAULT: 'vault',
  TONTON: 'tonton',
})

export const INPUT_SOURCE_OPTIONS = Object.freeze([
  {
    value: INPUT_SOURCES.TONTON,
    label: 'とんとん形式',
    description: 'ポケモン／ワンピースの単一シート',
  },
  {
    value: INPUT_SOURCES.VAULT,
    label: 'Vault形式',
    description: '1ファイルから5ジャンルを一括取込',
  },
])

export function normalizeInputSource(value) {
  return value === INPUT_SOURCES.VAULT || value === INPUT_SOURCES.TONTON
    ? value
    : INPUT_SOURCES.TONTON
}

export async function parseInputFile(file, inputSource) {
  let result

  if (inputSource === INPUT_SOURCES.VAULT) {
    result = await parseExcelAllGenres(file)
  } else if (inputSource === INPUT_SOURCES.TONTON) {
    result = await parseTontonExcel(file)
  } else {
    throw new Error(`未対応の入力タイプです: ${inputSource}`)
  }

  return Object.fromEntries(
    Object.entries(result).map(([genreKey, genreResult]) => [
      genreKey,
      { ...genreResult, inputSource },
    ]),
  )
}
