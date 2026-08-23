import { GENRES } from '../lib/genres.js'

export default function GenreTabs({ activeGenre, setActiveGenre, genreMeta }) {
  return (
    <div className="flex flex-wrap gap-1">
      {GENRES.map(g => {
        const meta = genreMeta[g.key] || { total: 0, selected: 0 }
        const isActive = g.key === activeGenre
        return (
          <button
            key={g.key}
            onClick={() => setActiveGenre(g.key)}
            className={`text-xs px-2.5 py-1.5 rounded-md cursor-pointer transition-colors border ${
              isActive
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-white text-[#5a6577] border-[#e0e4ea] hover:border-[#1e3a5f]'
            }`}
            title={`${g.label}: ${meta.total}件 / 選択${meta.selected}枚`}
          >
            {g.label}
            {meta.total > 0 && (
              <span className={`ml-1 ${isActive ? 'text-white/70' : 'text-[#8c95a4]'}`}>
                {meta.selected > 0 ? `${meta.selected}/${meta.total}` : meta.total}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
