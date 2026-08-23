import test from 'node:test'
import assert from 'node:assert/strict'

import { nextFocusableIndex } from '../src/lib/helpFocus.js'

test('使い方モーダル: Tab移動を先頭・末尾で循環させる', () => {
  assert.equal(nextFocusableIndex(0, 4, false), 1)
  assert.equal(nextFocusableIndex(3, 4, false), 0)
  assert.equal(nextFocusableIndex(2, 4, true), 1)
  assert.equal(nextFocusableIndex(0, 4, true), 3)
})

test('使い方モーダル: フォーカスが外にある場合もモーダル内へ戻す', () => {
  assert.equal(nextFocusableIndex(-1, 3, false), 0)
  assert.equal(nextFocusableIndex(-1, 3, true), 2)
  assert.equal(nextFocusableIndex(-1, 0, false), -1)
})
