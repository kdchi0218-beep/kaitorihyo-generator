import test from 'node:test'
import assert from 'node:assert/strict'

import { fetchSheetCsv, parseSheetCsvUrl } from '../api/sheet.js'

const CSV_URL = 'https://docs.google.com/spreadsheets/d/abc_DEF-123/gviz/tq?tqx=out%3Acsv&gid=0'

test('sheet proxy: Google SheetsのCSV export URLだけを受け付ける', () => {
  assert.equal(parseSheetCsvUrl(CSV_URL).hostname, 'docs.google.com')
  assert.throws(() => parseSheetCsvUrl('http://docs.google.com/spreadsheets/d/a/gviz/tq?tqx=out%3Acsv'), /https/)
  assert.throws(() => parseSheetCsvUrl('https://docs.google.com:444/spreadsheets/d/a/gviz/tq?tqx=out%3Acsv'), /port/)
  assert.throws(() => parseSheetCsvUrl('https://docs.google.com/open?id=a&tqx=out%3Acsv'), /path/)
  assert.throws(() => parseSheetCsvUrl('https://docs.google.com/spreadsheets/d/a/gviz/tq?tqx=out%3Acsv&gid=x'), /gid/)
})

test('sheet proxy: リダイレクト先を取得前に検証する', async () => {
  let calls = 0
  await assert.rejects(
    () => fetchSheetCsv(CSV_URL, {
      fetchImpl: async () => {
        calls += 1
        return new Response('', { status: 302, headers: { Location: 'http://127.0.0.1/latest/meta-data/' } })
      },
    }),
    /https|required|redirect target/,
  )
  assert.equal(calls, 1)
})

test('sheet proxy: 許可済みリダイレクトをmanualで追跡してCSVだけを返す', async () => {
  const calls = []
  const csv = await fetchSheetCsv(CSV_URL, {
    fetchImpl: async (url, init) => {
      calls.push({ url, redirect: init.redirect })
      if (calls.length === 1) {
        return new Response('', {
          status: 302,
          headers: { Location: 'https://docs.googleusercontent.com/export/result.csv' },
        })
      }
      return new Response('name,price\ncard,1000', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    },
  })
  assert.equal(csv, 'name,price\ncard,1000')
  assert.equal(calls.length, 2)
  assert.ok(calls.every(call => call.redirect === 'manual'))
})

test('sheet proxy: HTMLと容量超過を中継しない', async () => {
  await assert.rejects(
    () => fetchSheetCsv(CSV_URL, {
      fetchImpl: async () => new Response('<html></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    }),
    /content type/,
  )

  await assert.rejects(
    () => fetchSheetCsv(CSV_URL, {
      maxBytes: 8,
      fetchImpl: async () => new Response('name,price', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      }),
    }),
    /too large/,
  )
})
