import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { HELP_GUIDE, HELP_QUICK_STEPS } from '../src/lib/helpContent.js'

test('使い方: 初めての人向けの最短手順がある', () => {
  assert.equal(HELP_QUICK_STEPS.length, 5)
  assert.deepEqual(HELP_QUICK_STEPS.map(step => step.id), [
    'login', 'input', 'template', 'select', 'export',
  ])
  assert.match(HELP_QUICK_STEPS[0].body, /初回ログインしたブラウザ/)
  assert.match(HELP_QUICK_STEPS[1].body, /とんとん形式|パワン形式/)
  assert.match(HELP_QUICK_STEPS[2].body, /テンプレート|価格ルール/)
  assert.match(HELP_QUICK_STEPS[4].body, /PNG出力|CSV出力/)
})

test('使い方: 必須の案内区分を一意のIDとタイトルで持つ', () => {
  const required = [
    ['browser-login', 'ブラウザ固定ログイン'],
    ['input-formats', '2つの入力形式'],
    ['daily-workflow', '毎日の作業'],
    ['card-selection', 'カードの選択・編集・並べ替え'],
    ['regular-lists', '定番リスト'],
    ['missing-cards', '発注なし・事前登録・名前変更'],
    ['price-design-output', '価格・見た目・出力'],
    ['admin-reset', '管理者とブラウザ解除'],
    ['troubleshooting', '困ったとき'],
  ]

  assert.equal(new Set(HELP_GUIDE.map(section => section.id)).size, HELP_GUIDE.length)
  for (const [id, title] of required) {
    const section = HELP_GUIDE.find(item => item.id === id)
    assert.ok(section, `${id} が必要です`)
    assert.equal(section.title, title)
    assert.ok(section.items.length > 0)
  }
})

test('使い方: 誤操作を防ぐ重要な案内文を含む', () => {
  const text = HELP_GUIDE.flatMap(section => section.items).join('\n')
  for (const phrase of [
    'Excelをクリック / ドラッグ&ドロップ',
    'とんとん形式',
    'パワン形式',
    '端末ロック解除',
    '登録済みアカウント',
    '別の管理者',
    'PC交換',
    '選択中',
    '前回価格',
    'この内容で保存',
    '現在店舗の共有設定',
    '文字価格',
    '定番リストとテンプレートも削除',
    '運営担当',
    'Cmd+Shift+R',
  ]) assert.ok(text.includes(phrase), `「${phrase}」が必要です`)
})

test('使い方: 画面内ヘルプから詳細手順書を開ける', async () => {
  const source = await readFile(new URL('../src/components/HelpGuide.jsx', import.meta.url), 'utf8')
  assert.match(source, /docs\/USAGE\.md\?url/)
  assert.match(source, /詳細手順書を別タブで開く/)
})

test('使い方: 利用者向け手順書もパワン形式へ統一する', async () => {
  const usage = await readFile(new URL('../docs/USAGE.md', import.meta.url), 'utf8')
  const help = HELP_GUIDE.flatMap(section => section.items).join('\n')
  assert.match(usage, /パワン形式/)
  assert.doesNotMatch(usage, /Vault形式/)
  assert.doesNotMatch(help, /Vault形式/)
})

test('定番リスト: 画面内補足も実際の破壊的ボタン名で案内する', async () => {
  const source = await readFile(new URL('../src/components/CardListPanel.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /選択中をこのリストに保存/)
  assert.match(source, /「選択中で上書き」[^。]*既存内容を置き換え/)
})
