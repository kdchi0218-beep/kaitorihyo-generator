// カードの識別キーと定番リスト適用ロジック（supabase非依存・テスト可能な純粋関数）
//
// キー設計（2026-06 改訂）:
//   遊戯王は list_no が弾内番号で重複する（例: "JP001" が弾を跨いで多数存在）ため、
//   list_no + 種別 だけでは別カードを取り違える。必ずカード名を含め、
//   レアリティを持つジャンル（遊戯王）はレアリティも完全一致の条件にする。
//     遊戯王 : list_no + 種別 + 名前 + レアリティ
//     その他 : list_no + 種別 + 名前
//
//   実データ(241件)で現行155衝突 → この設計で全ジャンル衝突0を確認済み。
//
// 後方互換:
//   既存リストは {listNo,type,name}（レアリティ未保存）。applyList はレアリティ無しの
//   ベースキーでフォールバック照合するため、既存リストも作り直し不要でそのまま適用できる。

/** レアリティを除いた基本キー（list_no + 種別 + 名前）。後方互換フォールバック用 */
export function baseKey(c) {
  return `${c.listNo || ''}|${c.type || ''}|${c.name || ''}`
}

/** カードの識別キー（遊戯王等はレアリティも含む完全一致） */
export function cardKey(c) {
  return c.rarity ? `${baseKey(c)}|${c.rarity}` : baseKey(c)
}

/** リスト1項目の識別キー（保存時にレアリティがあれば含む） */
export function itemKey(it) {
  return it.rarity ? `${baseKey(it)}|${it.rarity}` : baseKey(it)
}

const productIdOf = (value) => String(value?.productId || '').trim()

/**
 * 商品IDを持つ新形式カードは商品ID、旧形式カードは従来の表示キーで識別する。
 * 同じ番号・名前・レアリティでも絵柄が異なる商品を、全処理で一貫して区別するための共通キー。
 */
export function identityKey(value) {
  const productId = productIdOf(value)
  return productId ? `product:${productId}` : itemKey(value)
}

/** Asia/Tokyo における日付を YYYY-MM-DD で返す（ローカル/UTC 時刻には依存しない）。 */
export function tokyoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${value.year}-${value.month}-${value.day}`
}

/** 型番+種別アンカーキー（名前非依存）。新旧で名称が変わっても型番で救済するための照合軸 */
function anchorKey(c) {
  return `${c.listNo || ''}|${c.type || ''}`
}

const _norm = (s) => String(s || '').replace(/\s+/g, '')

/**
 * 保存名と今日のカード名に「同一カードらしさ」があるか。
 * 新形式の素名は旧保存名の部分文字列になりやすい（例 新"MゲンガーEX" ⊂ 旧"MゲンガーEX(HOLLOW GEIST)"）ため
 * 包含 or バイグラム類似度で判定する。
 *
 * ⚠ 重要（2026-07-29 事故対応）: ポケモン等の型番（例 110/098）は弾をまたいで再利用されるため、
 * 「型番+種別が一致する候補が1枚だけ」でも別カードのことがある（ルギアV↔ガルーラ, ピカゼク↔アカネ）。
 * 名前の親和性が無い候補への解決は、たとえ候補1枚でも絶対にしない（在庫切れ扱い→⚠候補提示で人が確定）。
 */
function nameAffinity(itemName, cardName) {
  const a = _norm(itemName), b = _norm(cardName)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  return nameSimilarity(a, b) >= 0.5
}

/**
 * 型番+種別が一致する候補から「名前の親和性がある1枚」に絞る（絞れなければ null＝曖昧のまま）。
 * 親和性ゼロの候補は候補1枚でも採用しない（別カードへの勝手な置換防止・安全側）。
 */
function disambiguate(bucket, it) {
  if (!bucket || bucket.length === 0) return null
  const affine = bucket.filter(c => nameAffinity(it.name, c.name))
  if (affine.length === 0) return null              // 名前無関係 → 置換しない（在庫切れ扱い）
  if (affine.length === 1) return affine[0]
  const on = _norm(it.name)
  const sub = affine.filter(c => { const nn = _norm(c.name); return nn && on.includes(nn) })
  if (sub.length === 1) return sub[0]
  const pool = sub.length ? sub : affine
  const rr = pool.filter(c => c.rarity && on.includes(_norm(c.rarity)))
  if (rr.length === 1) return rr[0]
  return null                                       // 曖昧 → 在庫切れ扱い。detectRenamedCardsが候補提示
}

/**
 * 定番リストを今日のカード群に適用 → マッチしたカードを登録順で返す（在庫切れはスキップ）。
 *
 * - 完全キー（レアリティ込み）優先 → 無ければベースキー（レアリティ無視）でフォールバック
 *   （レアリティ未保存の既存リストもそのまま拾える）。
 * - 同キーに複数枚ある場合はリストの並び順どおり1枚ずつ割り当て（増殖防止・順序維持）。
 * @param {{listNo?:string,type?:string,name?:string,rarity?:string}[]} items
 * @param {object[]} allCards
 */
export function applyList(items, allCards) {
  return resolveItems(items, allCards).filter(Boolean)
}

/**
 * リスト項目を1件ずつ今日のカードに解決する（items と同じ並びで card|null を返す）。
 * applyList と同一の照合ルール。編集画面の「登録済み判定」「レアリティ補完」にも使う。
 * @returns {(object|null)[]}
 */
export function resolveItems(items, allCards) {
  const byProduct = new Map()
  const byFull = new Map()
  const byBase = new Map()
  const byAnchor = new Map()   // 型番+種別（名前非依存）。型番が空の項目はアンカー対象外＝BOX等の誤結合防止
  const push = (m, k, c) => { if (!m.has(k)) m.set(k, []); m.get(k).push(c) }
  for (const c of allCards) {
    const productId = productIdOf(c)
    if (productId) push(byProduct, productId, c)
    push(byFull, cardKey(c), c)
    push(byBase, baseKey(c), c)
    if (c.listNo) push(byAnchor, anchorKey(c), c)
  }
  const usedIds = new Set()
  const pickUnused = (bucket) => (bucket ? bucket.find(x => !usedIds.has(x.id)) : undefined)
  return (items || []).map(it => {
    let c
    // ① 商品ID（新形式で保存済みの項目）＝最も確実
    const productId = productIdOf(it)
    if (productId) {
      c = pickUnused(byProduct.get(productId))
      // 商品IDが当日データに無い場合、同名・同番号の別絵柄へは置換しない。
      if (!c) return null
    } else {
      // ② 完全キー（名前+レア一致）＝既存挙動
      c = pickUnused(byFull.get(itemKey(it)))
      // ③ ベースキー（名前一致）＝既存フォールバック（レア未保存の旧リスト・同名BOX等）
      if (!c) c = pickUnused(byBase.get(baseKey(it)))
      // ④ 型番+種別アンカー救済（新旧で名称が変わったカードを型番で拾う。型番ありのみ）
      if (!c && it.listNo) {
        const remain = (byAnchor.get(anchorKey(it)) || []).filter(x => !usedIds.has(x.id))
        c = disambiguate(remain, it)
      }
    }
    if (!c) return null                                // 在庫切れ（今日のデータに無い／曖昧で確定不可）
    usedIds.add(c.id)
    return c
  })
}

/**
 * 旧形式（レアリティ未保存）のリスト項目に、今日のデータから解決した情報を補完する。
 * 解決できた項目は新形式キー（商品ID・弾・レア込み）へ静かに移行する＝2回目以降は①商品IDで一発解決。
 * 解決できない項目（在庫切れ等）はそのまま返す。
 */
export function enrichItems(items, allCards) {
  const resolved = resolveItems(items, allCards)
  return (items || []).map((it, i) => {
    const c = resolved[i]
    if (!c) return it
    const out = { listNo: c.listNo || '', type: c.type || '', name: c.name || '' }
    if (c.rarity) out.rarity = c.rarity
    if (c.expansion) out.expansion = c.expansion   // 弾を保存（新形式・絞り込み/表示用）
    if (c.productId) out.productId = c.productId    // 商品IDを保存＝恒久移行（名称変更に不動）
    else if (it.productId) out.productId = it.productId
    if (c.imageUrl) out.img = c.imageUrl
    else if (it.img) out.img = it.img   // 今日画像が無くても保存済みの画像URLは維持
    if (c.basePrice > 0) out.base = c.basePrice  // 適用のたびに「前回読み込み価格」を最新化
    else if (it.base) out.base = it.base         // 在庫切れの間は前回値を維持
    // 手動修正価格: 在庫が戻ったらExcelの実価格を優先して解除 / 在庫切れの間は維持
    if (!(c.basePrice > 0)) {
      if (it.manualPrice != null) out.manualPrice = it.manualPrice
      if (it.manualText) out.manualText = it.manualText
      if (it.manualEditedOn) out.manualEditedOn = it.manualEditedOn
    }
    return out
  })
}

/**
 * 「発注なしカードも表示」をONにした瞬間用:
 * 現在の選択（手動追加・並び替え済みかもしれない）を壊さず、
 * ゴーストカードだけをリスト順の正しい位置に差し込む。
 * @param {object[]} selected 現在の選択中カード
 * @param {object[]} fullApplied applyListWithMissing の結果（実カード+ゴースト、リスト順）
 * @returns {object[]} ゴーストが差し込まれた新しい選択配列
 */
export function mergeMissingIntoSelection(selected, fullApplied) {
  const next = [...(selected || [])]
  const haveKeys = new Set(next.map(identityKey))
  let ptr = 0
  for (const c of fullApplied || []) {
    if (c.missing) {
      const key = identityKey(c)
      if (haveKeys.has(key)) {
        // 既に同じカードが居る（前回のゴースト等）→ その位置までポインタを進める
        const idx = next.findIndex((x, i) => i >= ptr && identityKey(x) === key)
        if (idx >= 0) ptr = idx + 1
      } else {
        next.splice(ptr, 0, c)
        haveKeys.add(key)
        ptr++
      }
    } else {
      // 実カード: 選択中に居ればその直後を次の挿入位置に（ユーザーが消したカードは復活させない）
      const idx = next.findIndex((x, i) => i >= ptr && x.id === c.id)
      if (idx >= 0) ptr = idx + 1
    }
  }
  return next
}

/**
 * 発注なしカードの手動修正価格をリスト項目へ書き戻す。
 * @param {object[]} items リストの保存項目
 * @param {object[]} ghosts 選択中の発注なしカード（手動修正済みのもの）
 * @param {{editedOn?: string}} options 手動修正を確定した日本日付
 * @returns {{next: object[], changed: boolean, matchedCount: number}}
 */
export function applyManualPricesToItems(items, ghosts, { editedOn } = {}) {
  const byKey = new Map()
  for (const g of ghosts || []) byKey.set(identityKey(g), g)
  let changed = false
  const matchedGhosts = new Set()
  const next = (items || []).map(it => {
    const g = byKey.get(identityKey(it))
    if (!g) return it
    matchedGhosts.add(g)
    const out = { ...it }
    const numericPrice = Number(g.price)
    const hasNumericPrice = g.priceManual && Number.isFinite(numericPrice) && numericPrice > 0
    const hasTextPrice = !hasNumericPrice && g.priceText != null && String(g.priceText) !== ''
    if (hasNumericPrice) {
      if (Number(out.manualPrice) !== numericPrice || out.manualText != null) {
        out.manualPrice = numericPrice
        delete out.manualText
        changed = true
      }
    } else if (hasTextPrice) {
      const text = String(g.priceText)
      if (out.manualText !== text || out.manualPrice != null) {
        out.manualText = text
        delete out.manualPrice
        changed = true
      }
    }
    // 日付だけが変わる「同額で当日価格として確定」も保存対象にする。
    // これにより翌日の表示では前回価格マークが復活し、同一日内は保存ループしない。
    const effectiveEditedOn = g.priceEditEditedOn || editedOn
    if ((hasNumericPrice || hasTextPrice) && effectiveEditedOn && out.manualEditedOn !== effectiveEditedOn) {
      out.manualEditedOn = effectiveEditedOn
      changed = true
    }
    return out
  })
  return { next, changed, matchedCount: matchedGhosts.size }
}

// 名前の類似度（バイグラムDice係数 0〜1）。名前変更検知の候補ランク付け用
function nameSimilarity(a, b) {
  const grams = s => {
    const t = String(s || '').replace(/\s/g, '')
    const out = new Set()
    for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
    return out
  }
  const A = grams(a), B = grams(b)
  if (A.size === 0 || B.size === 0) return 0
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return (2 * hit) / (A.size + B.size)
}

/**
 * 「Excel側でカード名が変わった可能性」を検知する。
 * リストで在庫切れ扱いになった項目のうち、同じ型番+種別（レアリティ保存済みならレアリティも一致）の
 * 未使用カードが今日のデータに存在するものを疑い候補として返す（名前類似度の高い順に1件提示）。
 * ※型番なしの項目は名前自体がキーのため検知不能（対象外）。
 * @returns {{index:number, item:object, candidate:object, similarity:number}[]}
 */
export function detectRenamedCards(items, allCards) {
  const resolved = resolveItems(items, allCards)
  const usedIds = new Set(resolved.filter(Boolean).map(c => c.id))
  const suspects = []
  ;(items || []).forEach((it, index) => {
    if (resolved[index]) return                  // 解決済みは問題なし
    if (productIdOf(it)) return                  // 商品ID付きは別商品への名前変更候補を出さない
    if (!it.listNo) return                       // 型番なしは検知不能
    const candidates = (allCards || []).filter(c =>
      c.listNo === it.listNo &&
      (c.type || '') === (it.type || '') &&
      !usedIds.has(c.id) &&
      (it.rarity ? (c.rarity || '') === it.rarity : true) &&
      c.name !== it.name
    )
    if (candidates.length === 0) return
    const best = candidates
      .map(c => ({ c, s: nameSimilarity(it.name, c.name) }))
      .sort((a, b) => b.s - a.s)[0]
    suspects.push({ index, item: it, candidate: best.c, similarity: best.s })
  })
  return suspects
}

/**
 * リスト項目の完全重複を除去する（同じ識別子は先勝ち・順序保持）。
 * 新形式の商品IDがある場合は旧形式の曖昧な同表示キーより優先する。同じ番号・名前・
 * レアリティでも、別商品IDの絵柄違いを持つジャンルで片方を落とさないため。
 */
export function dedupeItems(items) {
  const source = items || []
  // 同一表示キーに商品ID付き項目があれば、識別不能な旧項目は新項目へ統合する。
  // 先に全体を調べるため、旧→新 / 新→旧の並び順に結果が左右されない。
  const productBackedItemKeys = new Set(
    source.filter(it => productIdOf(it)).map(itemKey)
  )
  const productBackedBaseKeys = new Set(
    source.filter(it => productIdOf(it)).map(baseKey)
  )
  const seenProductIds = new Set()
  const seenLegacyKeys = new Set()
  return source.filter(it => {
    const productId = productIdOf(it)
    if (productId) {
      if (seenProductIds.has(productId)) return false
      seenProductIds.add(productId)
      return true
    }
    const key = itemKey(it)
    const supersededByProduct = productBackedItemKeys.has(key) || (
      !it.rarity && productBackedBaseKeys.has(baseKey(it))
    )
    if (supersededByProduct || seenLegacyKeys.has(key)) return false
    seenLegacyKeys.add(key)
    return true
  })
}

/**
 * リスト項目が現在のカード群で覆う識別キー集合を返す。
 * 旧項目も一度 resolve して実カードの商品IDへ寄せるため、同一表示キーの別絵柄まで
 * 「登録済み」と誤判定しない。
 */
export function listedKeysForItems(items, allCards) {
  const source = items || []
  const resolved = resolveItems(source, allCards || [])
  const keys = new Set()
  source.forEach((it, index) => {
    const card = resolved[index]
    if (card) {
      keys.add(identityKey(card))
      if (!productIdOf(card)) keys.add(baseKey(card))
    } else if (productIdOf(it)) {
      keys.add(identityKey(it))
    } else {
      keys.add(itemKey(it))
      keys.add(baseKey(it))
    }
  })
  return keys
}

/** CardSelector の「どのリストにも入っていない」判定。 */
export function isCardListed(card, listedKeys) {
  if (!listedKeys) return false
  if (productIdOf(card)) return listedKeys.has(identityKey(card))
  return listedKeys.has(cardKey(card)) || listedKeys.has(baseKey(card))
}

/** カード配列 → リスト保存用の最小項目に変換（登録順保持・弾/レア/商品ID/画像URL/基準価格があれば保存） */
export function cardsToItems(cards) {
  return (cards || []).map(c => {
    const it = { listNo: c.listNo || '', type: c.type || '', name: c.name || '' }
    if (c.rarity) it.rarity = c.rarity          // レアリティを保存（全ジャンル）
    if (c.expansion) it.expansion = c.expansion // 弾を保存（新形式・絞り込み/表示用）
    if (c.productId) it.productId = c.productId  // 商品IDを保存＝照合の最優先キー（名称変更に不動）
    if (c.imageUrl) it.img = c.imageUrl         // 発注が来てない日でも画像表示できるよう保存
    if (c.basePrice > 0) it.base = c.basePrice  // 前回読み込み価格（発注なし日の表示用）
    // 発注なしゴーストを「選択中で上書き」した時も手動価格の状態を落とさない。
    if (c.missing) {
      if (c.priceManual && Number.isFinite(Number(c.price)) && Number(c.price) > 0) it.manualPrice = Number(c.price)
      else if (c.priceText) it.manualText = c.priceText
      const manualEditedOn = c.priceEditEditedOn || c.manualEditedOn
      if (manualEditedOn) it.manualEditedOn = manualEditedOn
    }
    return it
  })
}

/**
 * 定番リストを「在庫切れ（今日のデータに無いカード）も含めて」適用する。
 * 在庫切れ分は保存済みの情報（名前・型番・画像URL・前回読み込み価格）からゴーストカードを作って並べる。
 * 前回価格が保存されていればそれを表示（priceIsLastマーカー付き・手動編集可）、無ければ0（「-」表示）。
 * @param {function} priceOf 基準価格→今日の表示価格に変換する関数（店舗の価格ルール適用）
 * @returns {object[]} 実カードとゴーストカードが保存順に混在した配列
 */
export function applyListWithMissing(items, allCards, priceOf = (b) => b, options = {}) {
  const resolved = resolveItems(items, allCards)
  return (items || []).map((it, i) => {
    if (resolved[i]) return resolved[i]
    const base = Number(it.base) > 0 ? Number(it.base) : 0
    const hasManual = it.manualPrice != null && !isNaN(Number(it.manualPrice))
    // 導入前の手動価格には編集日が無い。基準価格を持つ既存カードだけは
    // 日次表示へ移行し、基準価格も無い事前登録は従来どおり確定価格のままにする。
    const restoreManualAsLast = options.restorePreviousPriceDaily && hasManual && base > 0 && (
      (it.manualEditedOn && it.manualEditedOn !== options.todayKey) ||
      (!it.manualEditedOn && base > 0)
    )
    return {
      id: `missing_${i}_${identityKey(it)}`,   // 同一適用内で一意（i入りなので重複しない）
      productId: productIdOf(it),
      name: it.name || '',
      listNo: it.listNo || '',
      type: it.type || '',
      rarity: it.rarity || '',
      expansion: it.expansion || '',
      imageUrl: it.img || null,
      basePrice: base,
      // 手動修正済みならその価格/文言を優先表示（前回価格マークは付けない）
      price: hasManual ? Number(it.manualPrice) : (base > 0 ? priceOf(base) : 0),
      priceText: it.manualText || null,
      manualEditedOn: it.manualEditedOn || null,
      tag: [it.rarity, it.type].filter(Boolean).join(' ') || it.type || '',
      missing: true,                        // 発注なし（在庫切れ）マーカー
      priceIsLast: Boolean((base > 0 && !hasManual && !it.manualText) || restoreManualAsLast),
      priceManual: hasManual,               // 手動価格は掛け率変更でも再計算しない
    }
  })
}
