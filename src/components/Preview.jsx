import { useMemo, useRef } from 'react'
import { formatPrice } from '../lib/excelParser.js'

export default function Preview({ cards, settings }) {
  const containerRef = useRef()

  // プレビューのスケールを計算（画面にフィットさせる）
  const scale = useMemo(() => {
    const maxW = window.innerWidth - 480
    const maxH = window.innerHeight - 40
    const scaleW = maxW / settings.canvasWidth
    const scaleH = maxH / settings.canvasHeight
    return Math.min(scaleW, scaleH, 1)
  }, [settings.canvasWidth, settings.canvasHeight])

  return (
    <div className="flex-1 overflow-auto flex items-start justify-center p-5 bg-[#f0ede6]">
      <div className="flex flex-col items-center">
        <div className="mb-3 text-xs text-[#a09580]">
          プレビュー ({settings.canvasWidth} x {settings.canvasHeight}px) — {cards.length}枚
        </div>

        {/* Scaled wrapper for preview */}
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}>
          {/* Actual canvas - this is what gets exported */}
          <div
            id="preview-canvas"
            style={{
              width: settings.canvasWidth,
              height: settings.canvasHeight,
              backgroundColor: settings.bgColor,
              position: 'relative',
              overflow: 'hidden',
              fontFamily: "'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', sans-serif",
            }}
          >
            {/* Background image */}
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

            {/* Content layer */}
            <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              {settings.headerShow && (
                <Header settings={settings} />
              )}

              {/* Card grid */}
              <div style={{
                flex: 1,
                padding: `${settings.gridPaddingTop}px ${settings.gridPaddingX}px 10px`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}>
                <CardGrid cards={cards} settings={settings} />
              </div>

              {/* Footer */}
              {settings.footerShow && (
                <div style={{
                  padding: '8px 20px 12px',
                  textAlign: 'center',
                  fontSize: settings.footerFontSize,
                  color: settings.footerColor,
                  lineHeight: 1.4,
                }}>
                  {settings.footerText}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
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

function CardGrid({ cards, settings }) {
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

  const maxCards = settings.gridColumns * settings.gridRows
  const visibleCards = cards.slice(0, maxCards)

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${settings.gridColumns}, ${settings.cardWidth}px)`,
      gridTemplateRows: `repeat(${settings.gridRows}, auto)`,
      columnGap: settings.gridGapX,
      rowGap: settings.gridGapY,
      justifyContent: 'center',
    }}>
      {visibleCards.map((card) => (
        <CardCell key={card.id} card={card} settings={settings} />
      ))}
    </div>
  )
}

function CardCell({ card, settings }) {
  const price = formatPrice(card.price, settings)

  return (
    <div style={{
      width: settings.cardWidth,
      textAlign: 'center',
    }}>
      {/* Card image container */}
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
            crossOrigin="anonymous"
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
            <div style={{ fontSize: 10, marginBottom: 4, color: '#a09580' }}>NO IMAGE</div>
            <div style={{ textAlign: 'center', lineHeight: 1.2, wordBreak: 'break-all' }}>
              {card.name}
            </div>
          </div>
        )}

        {/* PSA logo overlay */}
        {settings.showPsaBadge && card.type === 'PSA10' && (
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
      </div>

      {/* Card name */}
      {settings.showCardName && (
        <div style={{
          fontSize: settings.cardNameFontSize,
          color: settings.cardNameColor,
          marginTop: 2,
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: settings.cardNameLines,
          WebkitBoxOrient: 'vertical',
          height: `${settings.cardNameFontSize * 1.2 * settings.cardNameLines}px`,
        }}>
          {card.name}
        </div>
      )}

      {/* Price */}
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
          display: 'inline-block',
        } : {}),
      }}>
        {price}
      </div>
    </div>
  )
}
