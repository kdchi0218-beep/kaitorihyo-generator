// 買取価格の算出ルール: 納品希望価格 ×(1-掛け率%) → 端数調整

// 金額帯の重なりを検出（適用は先勝ちなので、重なっていると後の帯が効かない）
function findTierOverlaps(tiers) {
  const warns = []
  for (let i = 0; i < tiers.length; i++) {
    for (let j = i + 1; j < tiers.length; j++) {
      const aMin = Number(tiers[i].min) || 0
      const aMax = (tiers[i].max === '' || tiers[i].max == null) ? Infinity : Number(tiers[i].max)
      const bMin = Number(tiers[j].min) || 0
      const bMax = (tiers[j].max === '' || tiers[j].max == null) ? Infinity : Number(tiers[j].max)
      if (aMin <= bMax && bMin <= aMax) warns.push(`帯${i + 1}と帯${j + 1}の範囲が重なっています（重なった金額は帯${i + 1}が優先）`)
    }
  }
  return warns
}

// 端数の単位の選択肢（高額カード対応で1,000円超も用意）
const UNIT_OPTIONS = [
  { v: 1, label: '1円（調整なし）' },
  { v: 10, label: '10円単位' },
  { v: 100, label: '100円単位' },
  { v: 500, label: '500円単位' },
  { v: 1000, label: '1,000円単位' },
  { v: 5000, label: '5,000円単位' },
  { v: 10000, label: '10,000円単位' },
  { v: 50000, label: '50,000円単位' },
]
const UNIT_VALUES = UNIT_OPTIONS.map(o => o.v)

export default function PricingSettings({ settings, update }) {
  const rate = settings.ratePercent ?? 0
  const flat = settings.priceFlatAdjust ?? 0
  const unit = settings.priceUnit ?? 100
  const rounding = settings.priceRounding ?? 'ceil'
  const tiers = settings.priceTiers ?? []
  const overlapWarns = findTierOverlaps(tiers)

  const setTier = (i, patch) => {
    const next = tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t)
    update('priceTiers', next)
  }
  const addTier = () => update('priceTiers', [...tiers, { min: 0, max: '', ratePercent: 0, flatAdjust: 0 }])
  const removeTier = (i) => update('priceTiers', tiers.filter((_, idx) => idx !== i))

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-[#5a6577] leading-relaxed">
        買取表の価格 = 納品希望価格 ×(1＋掛け率%) ＋ 定額調整 を、端数単位で調整して表示します。掛け率・定額は ＋で上乗せ／−で値引き。
      </p>

      <label className="block">
        <span className="text-[11px] font-semibold text-[#5a6577]">① 基本の掛け率（＋上乗せ／−値引き）</span>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number" min="-100" max="100" step="0.1" value={rate}
            onChange={e => update('ratePercent', Number(e.target.value))}
            className="w-24 text-xs px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
          />
          <span className="text-xs text-[#8c95a4]">%（例: +5 / -2.7）</span>
        </div>
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-[#5a6577]">② 基本の定額調整（円・＋上乗せ／−値引き）</span>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="number" step="100" value={flat}
            onChange={e => update('priceFlatAdjust', Number(e.target.value))}
            className="w-28 text-xs px-2 py-1 border border-[#d0d5dd] rounded outline-none focus:border-[#1e3a5f]"
          />
          <span className="text-xs text-[#8c95a4]">円（例: -500 / +500）</span>
        </div>
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-[#5a6577]">③ 基本の端数の単位</span>
        <select
          value={unit}
          onChange={e => update('priceUnit', Number(e.target.value))}
          className="w-full text-xs px-2 py-1 border border-[#d0d5dd] rounded mt-1"
        >
          {UNIT_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </label>

      <label className="block">
        <span className="text-[11px] font-semibold text-[#5a6577]">④ 基本の丸め方向</span>
        <select
          value={rounding}
          onChange={e => update('priceRounding', e.target.value)}
          className="w-full text-xs px-2 py-1 border border-[#d0d5dd] rounded mt-1"
        >
          <option value="ceil">繰り上げ（切り上げ）</option>
          <option value="round">四捨五入</option>
          <option value="floor">切り捨て</option>
        </select>
      </label>

      {/* 金額帯ごとのルール */}
      <div className="pt-2 border-t border-[#e0e4ea]">
        <div className="text-[11px] font-semibold text-[#5a6577] mb-1">金額帯ごとのルール（任意）</div>
        <p className="text-[10px] text-[#8c95a4] mb-2">該当する金額帯があればその掛け率・定額・端数・丸めを優先。未設定の項目は上の「基本」を使用。</p>
        <div className="space-y-2">
          {tiers.map((t, i) => (
            <div key={i} className="bg-[#f8f9fb] border border-[#e0e4ea] rounded p-2 space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] text-[#5a6577]">
                <input type="number" step="100" value={t.min ?? 0} onChange={e => setTier(i, { min: Number(e.target.value) })}
                  placeholder="から" className="w-20 px-1.5 py-1 border border-[#d0d5dd] rounded" />
                <span>円 〜</span>
                <input type="number" step="100" value={t.max ?? ''} onChange={e => setTier(i, { max: e.target.value === '' ? '' : Number(e.target.value) })}
                  placeholder="上限なし" className="w-20 px-1.5 py-1 border border-[#d0d5dd] rounded" />
                <span>円</span>
                <button onClick={() => removeTier(i)} className="ml-auto text-red-500 hover:text-red-700 cursor-pointer px-1">×</button>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#5a6577]">
                <span>掛け率</span>
                <input type="number" step="0.1" value={t.ratePercent ?? 0} onChange={e => setTier(i, { ratePercent: Number(e.target.value) })}
                  className="w-16 px-1.5 py-1 border border-[#d0d5dd] rounded" />
                <span>%　定額</span>
                <input type="number" step="100" value={t.flatAdjust ?? 0} onChange={e => setTier(i, { flatAdjust: Number(e.target.value) })}
                  className="w-20 px-1.5 py-1 border border-[#d0d5dd] rounded" />
                <span>円</span>
              </div>
              <div className="flex items-center gap-1 text-[10px] text-[#5a6577]">
                <span>端数</span>
                <select value={t.unit ?? ''} onChange={e => setTier(i, { unit: e.target.value === '' ? '' : Number(e.target.value) })}
                  className="px-1.5 py-1 border border-[#d0d5dd] rounded bg-white">
                  <option value="">基本に従う</option>
                  {UNIT_VALUES.map(v => <option key={v} value={v}>{v.toLocaleString()}円</option>)}
                </select>
                <span className="ml-1">丸め</span>
                <select value={t.rounding ?? ''} onChange={e => setTier(i, { rounding: e.target.value })}
                  className="px-1.5 py-1 border border-[#d0d5dd] rounded bg-white">
                  <option value="">基本に従う</option>
                  <option value="ceil">繰り上げ</option>
                  <option value="round">四捨五入</option>
                  <option value="floor">切り捨て</option>
                </select>
              </div>
            </div>
          ))}
        </div>
        <button onClick={addTier}
          className="mt-2 text-xs px-3 py-1 rounded bg-white border border-[#1e3a5f] text-[#1e3a5f] hover:bg-[#1e3a5f]/10 cursor-pointer">
          ＋ 金額帯を追加
        </button>
        {overlapWarns.length > 0 && (
          <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 space-y-0.5">
            {overlapWarns.map((w, i) => <div key={i}>⚠ {w}</div>)}
          </div>
        )}
      </div>

      <div className="text-[11px] text-[#8c95a4] bg-[#f8f9fb] border border-[#e0e4ea] rounded px-2 py-1.5">
        例: 185,498円 ×(1−2.7%) → 100円単位で繰り上げ → <span className="font-semibold text-[#b8860b]">180,500円</span>
      </div>
    </div>
  )
}
