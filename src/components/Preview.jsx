import { useMemo, useRef, useState, useEffect } from 'react'
import { formatPrice } from '../lib/pricing.js'
import { moveBlockByIndex } from '../lib/reorder.js'

export default function Preview({ cards, settings, placeholderImage, setCards }) {
  const maxCards = settings.gridColumns * settings.gridRows
  const backImage = placeholderImage || settings.placeholderImage

  // プレビュー上のドラッグ&ドロップ並べ替え（globalIndex = 全ページ通しのカード位置）
  const [dragIdx, setDragIdx] = useState(null)
  const [overIdx, setOverIdx] = useState(null)
  const dnd = setCards ? {
    dragIdx, overIdx,
    onDragStart: (i) => setDragIdx(i),
    onDragOver: (i) => setOverIdx(i),
    onDrop: (i) => {
      if (dragIdx !== null && dragIdx !== i) setCards(prev => moveBlockByIndex(prev, new Set([dragIdx]), i))
      setDragIdx(null); setOverIdx(null)
    },
    onDragEnd: () => { setDragIdx(null); setOverIdx(null) },
  } : null

  const pages = useMemo(() => {
    if (cards.length === 0) return [[]]
    const result = []
    for (let i = 0; i < cards.length; i += maxCards) {
      const pageCards = cards.slice(i, i + maxCards)
      // 空きスロットをプレースホルダー（ジャンル別の裏面）で埋める
      if (settings.fillEmptySlots && pageCards.length < maxCards) {
        const emptyCount = maxCards - pageCards.length
        for (let j = 0; j < emptyCount; j++) {
          pageCards.push({
            id: `placeholder_${i}_${j}`,
            name: '',
            price: 0,
            imageUrl: backImage,
            isPlaceholder: true,
          })
        }
      }
      result.push(pageCards)
    }
    return result
  }, [cards, maxCards, settings.fillEmptySlots, backImage])

  const containerRef = useRef(null)
  const [containerW, setContainerW] = useState(0)

  useEffect(() => {
    const calc = () => setContainerW(containerRef.current?.clientWidth || 0)
    calc()
    window.addEventListener('resize', calc)
    let ro
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      ro = new ResizeObserver(calc)
      ro.observe(containerRef.current)
    }
    return () => { window.removeEventListener('resize', calc); if (ro) ro.disconnect() }
  }, [])

  const scale = useMemo(() => {
    const maxW = (containerW || window.innerWidth - 480) - 40
    const maxH = window.innerHeight - 40
    const scaleW = maxW / settings.canvasWidth
    const scaleH = maxH / settings.canvasHeight
    return Math.min(scaleW, scaleH, 1)
  }, [containerW, settings.canvasWidth, settings.canvasHeight])

  return (
    <div ref={containerRef} className="flex-1 overflow-auto flex items-start justify-center p-5 bg-[#eef1f6]">
      <div className="flex flex-col items-center gap-6">
        <div className="text-xs text-[#8c95a4]">
          プレビュー ({settings.canvasWidth} x {settings.canvasHeight}px) — {cards.length}枚
          {pages.length > 1 && ` / ${pages.length}ページ`}
        </div>

        {pages.map((pageCards, pageIndex) => (
          <div key={pageIndex} style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
            {pages.length > 1 && (
              <div className="text-center text-xs text-[#8c95a4] mb-1">
                ページ {pageIndex + 1} / {pages.length}
              </div>
            )}
            <div
              id={`preview-canvas-${pageIndex}`}
              style={{
                width: settings.canvasWidth,
                height: settings.canvasHeight,
                backgroundColor: settings.bgColor,
                position: 'relative',
                overflow: 'hidden',
                fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif",
              }}
            >
              {settings.bgImage && (
                <img
                  src={settings.bgImage}
                  alt=""
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: settings.bgImageFit === 'stretch' ? 'fill' : settings.bgImageFit,
                    zIndex: 0,
                  }}
                />
              )}

              <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
                {settings.headerShow && (
                  <Header settings={settings} />
                )}

                {settings.showUpdateDate && !settings.updateDateFreePos && settings.updateDatePosition === 'top' && (
                  <UpdateDate settings={settings} />
                )}

                <div style={{
                  flex: 1,
                  padding: `${settings.gridPaddingTop}px ${settings.gridPaddingX}px 10px`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}>
                  <CardGrid cards={pageCards} settings={settings} baseIndex={pageIndex * maxCards} dnd={dnd} />
                </div>

                {settings.showUpdateDate && !settings.updateDateFreePos && settings.updateDatePosition !== 'top' && (
                  <UpdateDate settings={settings} />
                )}

                {settings.footerShow && (
                  <div style={{ padding: '8px 20px 12px', textAlign: 'center' }}>
                    <span style={{
                      fontSize: settings.footerFontSize,
                      color: settings.footerColor,
                      lineHeight: 1.4,
                      ...(settings.footerBgEnabled ? {
                        backgroundColor: settings.footerBgColor,
                        display: 'inline-block',
                        padding: '3px 10px',
                        borderRadius: 4,
                      } : {}),
                    }}>
                      {settings.footerText}
                    </span>
                  </div>
                )}

                {settings.showUpdateDate && settings.updateDateFreePos && (
                  <div style={{ position: 'absolute', top: settings.updateDateY, left: settings.updateDateX, zIndex: 3 }}>
                    <UpdateDateText settings={settings} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function UpdateDateText({ settings }) {
  return (
    <span style={{
      fontSize: settings.updateDateFontSize,
      color: settings.updateDateColor,
      whiteSpace: 'nowrap',
      ...(settings.updateDateBgEnabled ? {
        backgroundColor: settings.updateDateBgColor,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
      } : {}),
    }}>
      更新日: {new Date().toLocaleDateString('ja-JP')}
    </span>
  )
}

function UpdateDate({ settings }) {
  return (
    <div style={{ padding: '4px 20px 0', textAlign: settings.updateDateAlign || 'right' }}>
      <UpdateDateText settings={settings} />
    </div>
  )
}

function Header({ settings }) {
  const justifyMap = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: settings.logoImage ? justifyMap[settings.logoPosition] : 'center',
      padding: '15px 20px 0',
      gap: '12px',
    }}>
      {settings.logoImage && (
        <img
          src={settings.logoImage}
          alt="Logo"
          style={{
            height: settings.logoSize,
            objectFit: 'contain',
          }}
        />
      )}
      <div style={{
        fontSize: settings.headerFontSize,
        fontWeight: settings.headerFontWeight,
        color: settings.headerColor,
        letterSpacing: '2px',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap',
      }}>
        {settings.headerText}
      </div>
    </div>
  )
}

function CardGrid({ cards, settings, baseIndex = 0, dnd = null }) {
  if (cards.length === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: '#64748b',
        fontSize: 16,
      }}>
        カードを選択してください
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${settings.gridColumns}, ${settings.cardWidth}px)`,
      gridTemplateRows: `repeat(${settings.gridRows}, auto)`,
      gridAutoRows: 0,
      columnGap: settings.gridGapX,
      rowGap: settings.gridGapY,
      justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {cards.slice(0, settings.gridColumns * settings.gridRows).map((card, localIdx) => {
        const gi = baseIndex + localIdx   // 全ページ通しのインデックス
        const draggable = dnd && !card.isPlaceholder
        return (
          <div
            key={card.id}
            draggable={!!draggable}
            onDragStart={draggable ? (e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(gi)); dnd.onDragStart(gi) } : undefined}
            onDragOver={draggable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; dnd.onDragOver(gi) } : undefined}
            onDrop={draggable ? (e) => { e.preventDefault(); dnd.onDrop(gi) } : undefined}
            onDragEnd={draggable ? dnd.onDragEnd : undefined}
            style={{
              cursor: draggable ? 'grab' : undefined,
              // ドラッグ中だけの一時表示（出力時にドラッグ操作は行われないため画像に影響しない）
              opacity: dnd && dnd.dragIdx === gi ? 0.35 : 1,
              outline: dnd && dnd.overIdx === gi && dnd.dragIdx !== null && dnd.dragIdx !== gi ? '3px solid #1e90ff' : 'none',
              outlineOffset: 2,
              borderRadius: 4,
            }}
            title={draggable ? 'ドラッグで位置を入れ替え' : undefined}
          >
            <CardCell card={card} settings={settings} />
          </div>
        )
      })}
    </div>
  )
}

function rarityPosStyle(s) {
  const x = s.rarityOverlayOffsetX ?? 4
  const y = s.rarityOverlayOffsetY ?? 4
  switch (s.rarityOverlayPosition) {
    case 'top-center': return { top: y, left: '50%', transform: 'translateX(-50%)' }
    case 'top-right': return { top: y, right: x }
    case 'bottom-left': return { bottom: y, left: x }
    case 'bottom-center': return { bottom: y, left: '50%', transform: 'translateX(-50%)' }
    case 'bottom-right': return { bottom: y, right: x }
    default: return { top: y, left: x } // top-left
  }
}

function CardCell({ card, settings }) {
  const price = card.priceText ? card.priceText : formatPrice(card.price, settings)
  const isPlaceholder = card.isPlaceholder

  return (
    <div style={{
      width: settings.cardWidth,
      textAlign: 'center',
    }}>
      <div style={{
        width: settings.cardWidth,
        height: settings.cardHeight,
        backgroundColor: settings.cardBgColor,
        border: `${settings.cardBorderWidth}px solid ${settings.cardBorderColor}`,
        borderRadius: settings.cardBorderRadius,
        overflow: 'hidden',
        position: 'relative',
        boxShadow: settings.cardShadow ? '0 2px 8px rgba(0,0,0,0.4)' : 'none',
      }}>
        {card.imageUrl ? (
          <img
            src={card.imageUrl}
            alt={card.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#64748b',
            fontSize: 10,
            padding: 4,
          }}>
            <div style={{ fontSize: 10, marginBottom: 4, color: '#8c95a4' }}>NO IMAGE</div>
            <div style={{ textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
              {card.name}
            </div>
          </div>
        )}

        {/* 前回読み込み価格マーカー: 画面プレビューのみ表示・PNG/ZIP出力には載らない(export-exclude) */}
        {!isPlaceholder && card.priceIsLast && (
          <div
            className="export-exclude"
            title="前回読み込み時の価格で表示中（発注なし）。サイドバーの選択中リストでダブルクリックすると手動修正できます"
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              background: 'rgba(217, 119, 6, 0.92)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 'bold',
              lineHeight: 1,
              padding: '3px 5px',
              borderRadius: 3,
              zIndex: 5,
              pointerEvents: 'none',
            }}
          >前回価格</div>
        )}

        {!isPlaceholder && settings.showPsaBadge && card.type === 'PSA10' && (
          <img
            src="./psa-logo.png"
            alt="PSA10"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: 'auto',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* レアリティ オーバーレイ（遊戯王 rarity 列・非表示指定を除く） */}
        {!isPlaceholder && settings.showRarityOverlay && card.rarity && !(settings.rarityHidden && settings.rarityHidden[card.rarity]) && (
          <div style={{
            position: 'absolute',
            ...rarityPosStyle(settings),
            fontSize: settings.rarityOverlayFontSize,
            color: settings.rarityOverlayColor,
            fontWeight: 700,
            lineHeight: 1.1,
            maxWidth: '90%',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            ...(settings.rarityOverlayBgEnabled ? {
              backgroundColor: settings.rarityOverlayBgColor,
              borderRadius: settings.rarityOverlayRadius,
              padding: '1px 5px',
            } : {}),
          }}>
            {(settings.rarityAliases && settings.rarityAliases[card.rarity]) || card.rarity}
          </div>
        )}
      </div>

      {/* プレースホルダーにはカード名・価格を表示しない */}
      {!isPlaceholder && settings.showCardName && (
        <div style={{ marginTop: 2, textAlign: 'center' }}>
          <span style={{
            fontSize: settings.cardNameFontSize,
            color: settings.cardNameColor,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: settings.cardNameLines,
            WebkitBoxOrient: 'vertical',
            ...(settings.cardNameBgEnabled ? {
              backgroundColor: settings.cardNameBgColor,
              borderRadius: settings.cardNameBgRadius,
              padding: `${settings.cardNameBgPaddingY}px ${settings.cardNameBgPaddingX}px`,
              display: settings.cardNameBgFullWidth ? 'block' : 'inline-block',
              width: settings.cardNameBgFullWidth ? settings.cardWidth : undefined,
              boxSizing: 'border-box',
            } : {}),
          }}>
            {card.name}
          </span>
        </div>
      )}

      {/* 型番（list_no） */}
      {!isPlaceholder && settings.showListNo && card.listNo && (
        <div style={{ marginTop: settings.listNoMarginTop ?? 1, marginBottom: settings.listNoMarginBottom ?? 0, textAlign: 'center' }}>
          <span style={{
            fontSize: settings.listNoFontSize,
            color: settings.listNoColor,
            ...(settings.listNoBgEnabled ? {
              backgroundColor: settings.listNoBgColor,
              borderRadius: 3,
              padding: `${settings.listNoBgPaddingY ?? 1}px ${settings.listNoBgPaddingX ?? 5}px`,
              display: 'inline-block',
            } : {}),
          }}>
            {card.listNo}
          </span>
        </div>
      )}

      {!isPlaceholder && (
        <div style={{
          fontSize: settings.priceFontSize,
          fontWeight: settings.priceFontWeight,
          color: settings.priceColor,
          marginTop: settings.priceMarginTop || 2,
          letterSpacing: '0.5px',
          ...(settings.priceStroke ? {
            WebkitTextStroke: `${settings.priceStrokeWidth}px ${settings.priceStrokeColor}`,
            paintOrder: 'stroke fill',
          } : {}),
          ...(settings.priceBgEnabled ? {
            backgroundColor: settings.priceBgColor,
            borderRadius: settings.priceBgRadius,
            padding: `${settings.priceBgPaddingY}px ${settings.priceBgPaddingX}px`,
            display: settings.priceBgFullWidth ? 'block' : 'inline-block',
            width: settings.priceBgFullWidth ? settings.cardWidth : undefined,
            boxSizing: 'border-box',
          } : {}),
        }}>
          {price}
        </div>
      )}

      {/* プレースホルダーは名前・価格分の高さを確保 */}
      {isPlaceholder && settings.showCardName && (
        <div style={{ height: `${settings.cardNameFontSize * 1.2 * settings.cardNameLines}px`, marginTop: 2 }} />
      )}
      {isPlaceholder && (
        <div style={{ height: settings.priceFontSize, marginTop: settings.priceMarginTop || 2 }} />
      )}
    </div>
  )
}
