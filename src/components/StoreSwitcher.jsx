// 店舗切替（管理者は複数店を選択／店舗ユーザーは自店を表示）＋ 管理者向け管理ボタン
export default function StoreSwitcher({ stores, activeStoreId, setActiveStoreId, isAdmin, onOpenAdmin }) {
  const activeName = stores.find(s => s.id === activeStoreId)?.name || '—'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#8c95a4]">店舗</span>
      {isAdmin && stores.length > 1 ? (
        <select
          value={activeStoreId || ''}
          onChange={e => setActiveStoreId(e.target.value)}
          className="text-xs px-2 py-1 border border-[#d0d5dd] rounded bg-white text-[#1e3a5f] font-semibold"
        >
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      ) : (
        <span className="text-xs font-semibold text-[#1e3a5f]">{activeName}</span>
      )}
      {isAdmin && (
        <button
          onClick={onOpenAdmin}
          className="ml-auto text-[10px] px-2 py-1 rounded border border-[#1e3a5f]/30 text-[#1e3a5f] hover:bg-[#1e3a5f]/10 cursor-pointer"
        >
          店舗・ユーザー管理
        </button>
      )}
    </div>
  )
}
