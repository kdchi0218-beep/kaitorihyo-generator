// 価格ロジック: 納品希望価格(発注金額)をベースに、掛け率%で引いて端数調整する。
//
// 例: base=185,498, ratePercent=2.7, unit=100, rounding='ceil'
//   → 185498 * (1 - 0.027) = 180,489 → 100円単位で繰り上げ → 180,500
//
// 店舗が画面の設定でこの3値(掛け率/端数単位/丸め方向)を調整できるようにする。

export const DEFAULT_PRICING = {
  ratePercent: 0,    // 掛け率%（+で上乗せ / −で値引き）例: +5 / -2.7
  flatAdjust: 0,     // 定額調整（円・正負）例: -500 / +500
  // 金額帯ルール [{min,max,ratePercent,flatAdjust, unit?, rounding?}]
  // unit/rounding は任意。未設定（''/null）なら下の基本(unit/rounding)に従う
  tiers: [],
  unit: 100,         // 端数調整の単位（100円台）
  rounding: 'ceil',  // 'ceil'=繰り上げ / 'floor'=切り捨て / 'round'=四捨五入
}

// 金額帯ルールから該当ルールを探す（最初にマッチした帯）。なければ null。
function findTier(base, tiers) {
  if (!Array.isArray(tiers)) return null
  for (const t of tiers) {
    const min = Number(t.min) || 0
    const hasMax = t.max !== '' && t.max != null && !isNaN(Number(t.max))
    const max = hasMax ? Number(t.max) : Infinity
    if (base >= min && base <= max) return t
  }
  return null
}

const ROUND_FN = {
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
}

/**
 * 表示価格を計算する。
 * @param {number} basePrice 納品希望価格（発注金額）
 * @param {{ratePercent:number, unit:number, rounding:string}} pricing
 * @returns {number} 端数調整後の買取表表示価格。base が無効なら 0。
 */
export function computeDisplayPrice(basePrice, pricing = DEFAULT_PRICING) {
  const base = Number(basePrice)
  if (!base || isNaN(base) || base <= 0) return 0

  // 金額帯ルールに該当すればそれを優先、なければ基本の掛け率/定額
  const tier = findTier(base, pricing.tiers)
  const rate = Number(tier ? tier.ratePercent : pricing.ratePercent) || 0
  const flat = Number(tier ? tier.flatAdjust : pricing.flatAdjust) || 0
  // 端数の単位・丸め方向は金額帯ごとに個別指定可。未設定なら基本に従う
  const tierUnit = tier && tier.unit != null && tier.unit !== '' && Number(tier.unit) > 0 ? Number(tier.unit) : null
  const unit = tierUnit ?? (Number(pricing.unit) > 0 ? Number(pricing.unit) : 1)
  const roundKey = (tier && tier.rounding) ? tier.rounding : pricing.rounding
  const fn = ROUND_FN[roundKey] || Math.round

  // ①掛け率%（+で上乗せ/−で値引き）→ ②定額加減 → ③端数調整
  let v = base * (1 + rate / 100) + flat
  if (v < 0) v = 0
  return fn(v / unit) * unit
}

/**
 * 価格を表示文字列に整形する（既存 settings の表示オプションと併用）。
 */
export function formatPrice(price, settings = {}) {
  if (price == null || price === 0) return settings.priceNullText || '-'
  const prefix = settings.pricePrefix || ''
  const yen = settings.priceShowYen ? '¥' : ''
  if (settings.priceFormat === 'plain') {
    return `${prefix}${yen}${price}`
  }
  return `${prefix}${yen}${price.toLocaleString()}`
}
