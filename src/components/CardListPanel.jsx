import { useState, useEffect, useCallback, useRef } from 'react'
import {
  listCardLists, createCardList, saveCardListItems, deleteCardList,
  applyList, applyListWithMissing, mergeMissingIntoSelection, applyManualPricesToItems, detectRenamedCards, resolveItems, cardsToItems, cardKey, itemKey, baseKey, dedupeItems, enrichItems, copyCardListToStore, tokyoDateKey,
} from '../lib/cardLists.js'

// 定番リストの中身をCSV文字列に変換（保存順・今日のデータでの解決結果つき）
// 画像では分からない「リストに実際何が入っているか」を確認するためのデバッグ/監査用
function listToCsv(items, allCards) {
  const resolved = resolveItems(items || [], allCards || [])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = [['No', 'カード名', '型番', '種別', 'レアリティ', '今日のデータでの解決', '解決先カード名', '解決先価格', '前回読み込み基準価格'].map(esc).join(',')]
  ;(items || []).forEach((it, i) => {
    const r = resolved[i]
    rows.push([
      i + 1, it.name, it.listNo, it.type, it.rarity || '',
      r ? '○' : '在庫切れ',
      r ? r.name : '',
      r ? (r.priceText || r.price || '') : '',
      it.base || '',
    ].map(esc).join(','))
  })
  return '﻿' + rows.join('\r\n')  // BOM付き=Excelで文字化けしない
}
import CardListEditor from './CardListEditor.jsx'
import { computeDisplayPrice } from '../lib/pricing.js'
import { usesDailyPreviousPrice } from '../lib/genres.js'

// 定番リスト（店舗内共有・ジャンル別）。取込後に「適用」で選択中へ投入。
export default function CardListPanel({ genre, allCards, cards, setCards, storeId, stores = [], settings = {}, onListedKeysChange }) {
  // 発注なしカードの「前回読み込み価格」を今日の価格ルールで表示価格に変換する
  const priceOf = (base) => computeDisplayPrice(base, {
    ratePercent: settings.ratePercent ?? 0,
    flatAdjust: settings.priceFlatAdjust ?? 0,
    tiers: settings.priceTiers ?? [],
    unit: settings.priceUnit ?? 100,
    rounding: settings.priceRounding ?? 'ceil',
  })
  const restoresPreviousPriceDaily = usesDailyPreviousPrice(genre)
  // 適用時に日付を評価する。画面を日またぎで開き続けても前日扱いを固定しない。
  const missingApplyOptions = () => restoresPreviousPriceDaily
    ? { restorePreviousPriceDaily: true, todayKey: tokyoDateKey() }
    : {}
  const [lists, setLists] = useState([])
  const [activeId, setActiveId] = useState('')
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [editing, setEditing] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [sendTarget, setSendTarget] = useState('')
  // Excel側でカード名が変わった可能性の警告（適用時に検知）
  const [renameSuspects, setRenameSuspects] = useState([])
  // 「＋事前登録」ボタンから編集を開いた時、事前登録フォームを最初から開く
  const [preOpenRequest, setPreOpenRequest] = useState(false)
  const listsRef = useRef([])
  const listCacheRef = useRef(new Map())
  const saveQueueRef = useRef(Promise.resolve())
  const contextRef = useRef(`${storeId}|${genre}`)
  contextRef.current = `${storeId}|${genre}`

  // 疑い1件をワンクリックでリストの新しい名前に更新する
  const handleRenameAccept = async (suspect) => {
    if (!activeList) return
    setBusy(true)
    try {
      const items = (activeList.items || []).map((it, i) => {
        if (i !== suspect.index) return it
        const c = suspect.candidate
        const next = { ...it, name: c.name }
        if (c.rarity) next.rarity = c.rarity
        if (c.imageUrl) next.img = c.imageUrl
        if (c.basePrice > 0) { next.base = c.basePrice; delete next.manualPrice; delete next.manualText; delete next.manualEditedOn }
        return next
      })
      await saveCardListItems(activeList.id, dedupeItems(items))
      await reload()
      setRenameSuspects(prev => prev.filter(s => s !== suspect))
      note('success', `「${suspect.item.name}」→「${suspect.candidate.name}」に更新しました（再度適用してください）`)
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  // 発注が来てない（今日のExcelに無い）カードもゴースト表示するか
  // チェック操作だけでプレビューに即反映する（適用ボタン不要）:
  //   ON  → 選択中を壊さず、発注なし分だけをリスト順の位置に差し込む
  //   OFF → 発注なし分（missing）だけをプレビューから外す
  const [includeMissing, setIncludeMissing] = useState(() => localStorage.getItem('tonton_includeMissing') === '1')
  const toggleIncludeMissing = (v) => {
    setIncludeMissing(v)
    localStorage.setItem('tonton_includeMissing', v ? '1' : '0')
    if (!v) {
      let removed = 0
      setCards(prev => { const next = prev.filter(c => !c.missing); removed = prev.length - next.length; return next })
      note('success', '発注なしカードをプレビューから外しました')
      return
    }
    if (!activeList) { note('error', 'リストを選択してください'); return }
    const items = activeList.items || []
    const enriched = dedupeItems(enrichItems(items, allCards))
    // 適用ボタンと同様、ここでも最新Excelの価格・画像でリストを静かに更新保存する
    // （前回価格が「リスト作成時の金額」に固定されないように）
    if (JSON.stringify(enriched) !== JSON.stringify(items)) {
      saveCardListItems(activeList.id, enriched).then(() => reload()).catch(() => {})
    }
    const full = applyListWithMissing(enriched, allCards, priceOf, missingApplyOptions())
      .map(c => c.missing ? { ...c, fromListId: activeList.id } : c)
    const ghosts = full.filter(c => c.missing).length
    setCards(prev => mergeMissingIntoSelection(prev, full))
    note('success', ghosts > 0 ? `発注なし ${ghosts}件をプレビューに表示しました（前回価格つき）` : 'このリストに発注なしカードはありません')
  }
  const otherStores = stores.filter(s => s.id !== storeId)
  const editorRef = useRef(null)

  const reload = useCallback(async () => {
    if (!storeId) return
    const requestContext = `${storeId}|${genre}`
    try {
      const l = await listCardLists(storeId, genre)
      l.forEach(list => listCacheRef.current.set(list.id, list))
      if (contextRef.current !== requestContext) return
      setLists(l)
      setActiveId(prev => (l.find(x => x.id === prev)?.id) || l[0]?.id || '')
    } catch (e) {
      if (contextRef.current === requestContext) setMsg({ type: 'error', message: e.message })
    }
  }, [storeId, genre])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    listsRef.current = lists
    lists.forEach(list => listCacheRef.current.set(list.id, list))
  }, [lists])

  // このジャンルの全リストが覆っているカードキー集合 → CardSelectorの「リスト未登録のみ」フィルタ用
  useEffect(() => {
    if (!onListedKeysChange) return
    const keys = new Set()
    for (const l of lists) {
      for (const it of (l.items || [])) {
        keys.add(itemKey(it))
        keys.add(baseKey(it))   // レアリティ有無の差を吸収
      }
    }
    onListedKeysChange(keys)
  }, [lists, onListedKeysChange])

  const activeList = lists.find(l => l.id === activeId)
  const note = (type, message) => setMsg({ type, message })

  // 編集を閉じる前の確認。未保存の変更があれば「保存して完了」をconfirmで聞く
  const finishEditing = async () => {
    const ed = editorRef.current
    if (ed?.isDirty()) {
      if (confirm('リストを編集中です。変更を保存して編集を完了しますか？\n（キャンセル = 保存せずに閉じる）')) {
        try { await ed.saveOnly(); await reload(); note('success', '編集中の変更を保存しました') }
        catch (e) { note('error', `保存に失敗: ${e.message}`) }
      }
    }
    setEditing(false)
    setPreOpenRequest(false)
  }
  const finishEditingRef = useRef(finishEditing)
  finishEditingRef.current = finishEditing

  // 発注なしカードの価格をユーザーが手動修正した時だけ、リストのDBにも書き戻す。
  // 保存は直列化し、先行保存が後続編集をDB上で巻き戻す競合を防ぐ。
  useEffect(() => {
    const edited = (cards || []).filter(c => c.missing && c.fromListId && c.priceEditToken != null)
    if (edited.length === 0) return
    const saveContext = contextRef.current
    const listsSnapshot = lists
    const t = setTimeout(async () => {
      const savePendingEdits = async () => {
        const byList = new Map()
        for (const g of edited) {
          if (!byList.has(g.fromListId)) byList.set(g.fromListId, [])
          byList.get(g.fromListId).push(g)
        }
        const saved = []
        const savedItemsByList = new Map()
        let hadFailure = false
        let hadUnmatched = false
        for (const [listId, ghosts] of byList) {
          const list = listCacheRef.current.get(listId) || listsSnapshot.find(x => x.id === listId)
          if (!list) { hadUnmatched = true; continue }
          const { next, changed, matchedCount } = applyManualPricesToItems(
            list.items || [], ghosts, restoresPreviousPriceDaily ? { editedOn: tokyoDateKey() } : undefined
          )
          if (matchedCount !== ghosts.length) { hadUnmatched = true; continue }
          try {
            if (changed) {
              await saveCardListItems(listId, next)
              listCacheRef.current.set(listId, { ...list, items: next })
              savedItemsByList.set(listId, next)
            }
            ghosts.forEach(g => saved.push({ listId, id: g.id, token: g.priceEditToken }))
          } catch { hadFailure = true }
        }
        if (saved.length > 0 && contextRef.current === saveContext) {
          if (savedItemsByList.size > 0) {
            const applySavedItems = (list) => savedItemsByList.has(list.id)
              ? { ...list, items: savedItemsByList.get(list.id) }
              : list
            listsRef.current = listsRef.current.map(applySavedItems)
            setLists(prev => prev.map(applySavedItems))
          }
          setCards(prev => prev.map(card => {
            const done = saved.find(x => x.listId === card.fromListId && x.id === card.id && x.token === card.priceEditToken)
            if (!done) return card
            const savedCard = { ...card }
            delete savedCard.priceEditToken
            if (savedCard.priceEditEditedOn) savedCard.manualEditedOn = savedCard.priceEditEditedOn
            delete savedCard.priceEditEditedOn
            return savedCard
          }))
          note('success', restoresPreviousPriceDaily ? '手動修正した価格を当日の価格としてリストに保存しました' : '手動修正した価格をリストに保存しました')
        }
        if (contextRef.current === saveContext) {
          if (hadUnmatched) note('error', '手動修正の保存先がリスト内で見つかりません。価格は未保存のままです')
          if (hadFailure) note('error', '手動修正の保存に失敗しました。もう一度価格を確定してください')
        }
      }
      saveQueueRef.current = saveQueueRef.current.then(savePendingEdits, savePendingEdits)
    }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, lists])

  // ジャンルまたは店舗が切り替わったら、編集パネルを前の文脈のまま残さない（編集完了確認→閉じる）
  const editContext = `${storeId}|${genre}`
  const prevContextRef = useRef(editContext)
  useEffect(() => {
    if (prevContextRef.current === editContext) return
    prevContextRef.current = editContext
    finishEditingRef.current()
  }, [editContext])

  const handleApply = () => {
    if (!activeList) return
    const items = activeList.items || []
    // 旧形式(レアリティ/画像URL未保存)の項目はこの機会に補完して静かに保存する。
    // 同じ型番・名前・種別でレアリティ違いが入荷しても、以後の適用結果がブレなくなる
    const enriched = dedupeItems(enrichItems(items, allCards))
    if (JSON.stringify(enriched) !== JSON.stringify(items)) {
      saveCardListItems(activeList.id, enriched).then(() => reload()).catch(() => {})
    }
    // Excel側でカード名が変わった可能性を検知（同型番の未使用カードが居る在庫切れ項目）
    setRenameSuspects(detectRenamedCards(enriched, allCards).map(s => ({ ...s, listId: activeList.id })))
    if (includeMissing) {
      // 発注なし分もゴーストカードとして保存順どおりに表示（前回読み込み価格 or「-」・手動編集可）
      const all = applyListWithMissing(enriched, allCards, priceOf, missingApplyOptions())
        .map(c => c.missing ? { ...c, fromListId: activeList.id } : c)  // 手動修正の書き戻し先を記録
      const missing = all.filter(c => c.missing).length
      const withLast = all.filter(c => c.priceIsLast).length
      setCards(all)
      note('success', `「${activeList.name}」適用 — 全${all.length}件表示（発注なし${missing}件・うち前回価格で表示${withLast}件）`)
    } else {
      const matched = applyList(enriched, allCards)
      setCards(matched)
      note('success', `「${activeList.name}」適用 — ${matched.length}件選択（在庫切れ ${enriched.length - matched.length}件スキップ）`)
    }
  }

  const handleSaveCurrent = async () => {
    if (!activeList) return
    if (cards.length === 0) { note('error', '選択中のカードがありません'); return }
    if (!confirm(`「${activeList.name}」を選択中 ${cards.length}件で丸ごと上書きします。\n（既存のリスト内容は消えます）よろしいですか？`)) return
    setBusy(true)
    try {
      await saveCardListItems(activeList.id, dedupeItems(cardsToItems(cards)))
      await reload()
      note('success', `「${activeList.name}」を選択中 ${cards.length}件で上書きしました`)
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  // 選択中のうち、リストにまだ無いものだけを追加（差分マージ・既存リストは消えない）
  const handleAddCurrent = async () => {
    if (!activeList) return
    if (cards.length === 0) { note('error', '選択中のカードがありません'); return }
    // リストが今のデータ上で実際に指す実カード(id)を基準に新規分を判定（型番なしのcardKey衝突を回避）
    const listIds = new Set(applyList(activeList.items || [], allCards).map(c => c.id))
    const seenKey = new Set()
    const adds = cardsToItems(
      cards.filter(c => !listIds.has(c.id) && !seenKey.has(cardKey(c)) && seenKey.add(cardKey(c)))
    )
    if (adds.length === 0) { note('success', '追加するものはありません（選択中は全て登録済み）'); return }
    setBusy(true)
    try {
      await saveCardListItems(activeList.id, dedupeItems(enrichItems([...(activeList.items || []), ...adds], allCards)))
      await reload()
      note('success', `${adds.length}件をリストに追加（差分・既存は維持）`)
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  const handleCreate = async () => {
    if (!newName.trim() || !storeId) return
    setBusy(true)
    try {
      const l = await createCardList(storeId, genre, newName.trim())
      setNewName('')
      await reload()
      setActiveId(l.id)
      note('success', `リスト「${l.name}」を作成`)
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  const handleSendList = async () => {
    if (!activeList || !sendTarget) return
    setBusy(true)
    try {
      await copyCardListToStore(sendTarget, genre, activeList.name, activeList.items || [])
      const sn = stores.find(s => s.id === sendTarget)?.name || '他店舗'
      note('success', `「${activeList.name}」を ${sn} に送信しました`)
      setSendOpen(false); setSendTarget('')
    } catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  // リストの中身をCSVでダウンロード（画像では分からない中身の確認用）
  const handleDownloadCsv = () => {
    if (!activeList) return
    const csv = listToCsv(activeList.items || [], allCards)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const today = new Date().toISOString().slice(0, 10)
    a.download = `定番リスト_${activeList.name}_${genre}_${today}.csv`
    a.href = url
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    note('success', `「${activeList.name}」のCSVをダウンロードしました（${(activeList.items || []).length}件）`)
  }

  const handleDelete = async () => {
    if (!activeList) return
    if (!confirm(`定番リスト「${activeList.name}」を削除しますか？（この店舗から消えます）`)) return
    setBusy(true)
    try { await deleteCardList(activeList.id); await reload(); note('success', '削除しました') }
    catch (e) { note('error', e.message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2 bg-[#f0f4f8] border border-[#cdd8e6] rounded-lg p-2.5">
      <div className="text-[11px] font-semibold text-[#1e3a5f]">定番リスト（この店舗内）</div>

      {lists.length > 0 ? (
        <div className="flex gap-1.5 items-center">
          <select
            value={activeId}
            onChange={async e => {
              const next = e.target.value
              // 編集中に別リストへ切り替えた時も、編集完了を確認してから（別リスト上書き事故防止）
              if (editing) await finishEditing()
              setActiveId(next)
            }}
            className="flex-1 text-xs px-2 py-1 border border-[#d0d5dd] rounded bg-white"
          >
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.name}（{(l.items || []).length}）</option>
            ))}
          </select>
          <button
            onClick={handleApply}
            disabled={!activeList}
            className="text-xs px-3 py-1 rounded bg-[#3d7c4f] hover:bg-[#346b44] text-white cursor-pointer disabled:opacity-50"
          >適用</button>
        </div>
      ) : (
        <p className="text-[11px] text-[#8c95a4]">まだリストがありません。下で作成してください。</p>
      )}

      {lists.length > 0 && (
        <label className="flex items-center gap-1.5 text-[10px] text-[#5a6577] cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeMissing}
            onChange={e => toggleIncludeMissing(e.target.checked)}
            className="cursor-pointer"
          />
          発注が来てないカードも表示する（画像つき・前回読み込み価格で表示→必要なら手動修正）
        </label>
      )}

      {/* カード名変更の可能性 警告 */}
      {renameSuspects.length > 0 && renameSuspects[0].listId === activeId && (
        <div className="bg-amber-50 border border-amber-300 rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-amber-800">
              ⚠ Excel側でカード名が変わった可能性: {renameSuspects.length}件
            </span>
            <button onClick={() => setRenameSuspects([])} className="text-[10px] text-amber-700 hover:text-amber-900 cursor-pointer">閉じる</button>
          </div>
          <p className="text-[9px] text-amber-700 leading-snug">
            リストの名前と一致しないけど、同じ型番・種別のカードが今日のデータにあります。名前が変わっただけなら「更新」で引き継げます（画像・価格も更新）。
          </p>
          {renameSuspects.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white rounded border border-amber-200 px-1.5 py-1 text-[10px]">
              <div className="flex-1 min-w-0">
                <div className="truncate text-[#5a6577]">保存名: {s.item.name}</div>
                <div className="truncate text-amber-800 font-semibold">今日: {s.candidate.name} <span className="text-[#8c95a4] font-normal">[{s.candidate.listNo}/{s.candidate.type}]</span></div>
              </div>
              <button
                onClick={() => handleRenameAccept(s)}
                disabled={busy}
                className="text-[10px] px-2 py-1 rounded bg-amber-500 hover:bg-amber-600 text-white cursor-pointer flex-shrink-0 disabled:opacity-50"
              >この名前に更新</button>
            </div>
          ))}
        </div>
      )}

      {activeList && (
        <>
          <div className="flex gap-1.5">
            <button
              onClick={() => { if (editing) finishEditing(); else setEditing(true) }}
              className={`flex-1 text-[11px] px-2 py-1 rounded cursor-pointer border ${editing ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-[#1e3a5f] border-[#1e3a5f]'}`}
              title="リストの中身を1枚ずつ追加・削除・並べ替え"
            >{editing ? '編集を閉じる' : '中身を編集'}</button>
            <button
              onClick={handleAddCurrent}
              disabled={busy}
              className="flex-1 text-[11px] px-2 py-1 rounded bg-[#3d7c4f] hover:bg-[#346b44] text-white cursor-pointer disabled:opacity-50"
              title="選択中のうち、リストに無いものだけ追加（既存は消えない）"
            >選択中を追加</button>
          </div>
          <button
            onClick={() => {
              if (editing) { editorRef.current?.openPreRegister?.() }
              else { setPreOpenRequest(true); setEditing(true) }
            }}
            className="w-full text-[11px] px-2 py-1.5 rounded border-2 border-dashed border-[#3d7c4f]/60 text-[#3d7c4f] hover:bg-[#3d7c4f]/10 cursor-pointer font-semibold"
            title="Excelにまだ無いカードを手入力でこのリストに登録（発注が来たら自動で実データに切替）"
          >＋ Excelに無いカードを手入力で追加（事前登録）</button>
          <div className="flex gap-1.5">
            <button
              onClick={handleSaveCurrent}
              disabled={busy}
              className="flex-1 text-[10px] px-2 py-1 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer disabled:opacity-50"
              title="選択中でリストを丸ごと置き換え（既存は消える）"
            >選択中で上書き</button>
            <button
              onClick={handleDownloadCsv}
              disabled={busy}
              className="text-[10px] px-2 py-1 rounded bg-[#eef1f6] hover:bg-[#dfe3ea] text-[#5a6577] border border-[#d0d5dd] cursor-pointer disabled:opacity-50"
              title="リストの中身（保存順・型番・今日の解決結果）をCSVで保存"
            >CSV</button>
            {otherStores.length > 0 && (
              <button
                onClick={() => { setSendOpen(v => !v); setSendTarget('') }}
                disabled={busy}
                className="text-[10px] px-2 py-1 rounded bg-[#3d7c4f]/10 border border-[#3d7c4f]/40 text-[#3d7c4f] hover:bg-[#3d7c4f]/20 cursor-pointer"
              >他店へ送信</button>
            )}
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-[10px] px-2 py-1 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
            >リスト削除</button>
          </div>
          {sendOpen && (
            <div className="flex items-center gap-1.5 flex-wrap bg-white border border-[#3d7c4f]/30 rounded p-1.5">
              <span className="text-[10px] text-[#5a6577]">送信先の店舗:</span>
              <select value={sendTarget} onChange={e => setSendTarget(e.target.value)} className="text-[11px] px-2 py-1 border border-[#d0d5dd] rounded bg-white">
                <option value="">選択...</option>
                {otherStores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button onClick={handleSendList} disabled={!sendTarget || busy} className="text-[11px] px-2 py-1 rounded bg-[#3d7c4f] text-white cursor-pointer disabled:opacity-50">この店舗に送信</button>
              <button onClick={() => setSendOpen(false)} className="text-[10px] text-[#8c95a4] cursor-pointer">×</button>
            </div>
          )}
          {editing && (
            <CardListEditor
              key={activeList.id}
              ref={editorRef}
              list={activeList}
              allCards={allCards}
              cards={cards}
              genre={genre}
              defaultPreOpen={preOpenRequest}
              onSaved={(savedItems) => {
                setEditing(false)
                reload()
                // 保存したリストをそのまま選択中に再適用 → プレビューとリストを常に一致させる
                const matched = includeMissing
                  ? applyListWithMissing(savedItems || [], allCards, priceOf, missingApplyOptions())
                      .map(c => c.missing ? { ...c, fromListId: activeList.id } : c)
                  : applyList(savedItems || [], allCards)
                setCards(matched)
                note('success', `リストを保存し、プレビューに反映しました（${matched.length}件）`)
              }}
              onClose={() => finishEditing()}
            />
          )}
        </>
      )}

      <div className="flex gap-1.5">
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
          placeholder="新しいリスト名（例: 定番）"
          className="flex-1 text-xs px-2 py-1 border border-[#d0d5dd] rounded bg-white outline-none focus:border-[#1e3a5f]"
        />
        <button
          onClick={handleCreate}
          disabled={busy || !newName.trim()}
          className="text-xs px-2.5 py-1 rounded bg-white border border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/10 cursor-pointer disabled:opacity-40"
        >作成</button>
      </div>

      {msg && (
        <div className={`text-[11px] px-2 py-1 rounded border ${
          msg.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
        }`}>{msg.message}</div>
      )}

      <p className="text-[10px] text-[#8c95a4] leading-snug">
        使い方: ①カードと順番を確認→「選択中で上書き」で既存内容を置き換え。②毎日Excel取込後に「適用」で、登録カードを今日の価格で自動選択（在庫切れは自動スキップ）。
      </p>
    </div>
  )
}
