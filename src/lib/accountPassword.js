export const ACCOUNT_PASSWORD_MIN_LENGTH = 8
export const ACCOUNT_PASSWORD_MAX_BYTES = 72

const CHARACTER_SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  digit: '23456789',
  symbol: '-_.!',
}
const PASSWORD_POOL = Object.values(CHARACTER_SETS).join('')

function randomIndex(max) {
  const values = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / max) * max
  do globalThis.crypto.getRandomValues(values)
  while (values[0] >= limit)
  return values[0] % max
}

export function accountPasswordUtf8Bytes(password) {
  return new TextEncoder().encode(password).byteLength
}

export function isValidAccountPasswordLength(password) {
  return typeof password === 'string'
    && [...password].length >= ACCOUNT_PASSWORD_MIN_LENGTH
    && accountPasswordUtf8Bytes(password) <= ACCOUNT_PASSWORD_MAX_BYTES
}

export function generateAccountPassword() {
  const characters = Object.values(CHARACTER_SETS)
    .map(characterSet => characterSet[randomIndex(characterSet.length)])

  while (characters.length < 16) {
    characters.push(PASSWORD_POOL[randomIndex(PASSWORD_POOL.length)])
  }
  for (let i = characters.length - 1; i > 0; i--) {
    const swapIndex = randomIndex(i + 1)
    ;[characters[i], characters[swapIndex]] = [characters[swapIndex], characters[i]]
  }
  return characters.join('')
}
