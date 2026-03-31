export const DEFAULT_SETTINGS = {
  // Canvas
  canvasWidth: 1080,
  canvasHeight: 1350,

  // Background
  bgColor: '#1a1a2e',
  bgImage: null,
  bgImageFit: 'cover', // cover, contain, stretch

  // Header
  headerText: 'PSA10買取表',
  headerFontSize: 48,
  headerColor: '#ffd700',
  headerFontWeight: 'bold',
  headerShow: true,
  logoImage: null,
  logoSize: 80,
  logoPosition: 'left', // left, center, right

  // Grid
  gridColumns: 7,
  gridRows: 8,
  gridGapX: 6,
  gridGapY: 6,
  gridPaddingX: 20,
  gridPaddingTop: 100,
  cardWidth: 120,
  cardHeight: 168,

  // Card frame
  cardBorderColor: '#333333',
  cardBorderWidth: 1,
  cardBgColor: '#2a2a3e',
  cardBorderRadius: 4,
  cardShadow: true,

  // PSA badge
  showPsaBadge: true,
  psaBadgeColor: '#ff0000',
  psaBadgeTextColor: '#ffffff',
  psaBadgeSize: 24,

  // Card name
  showCardName: true,
  cardNameFontSize: 9,
  cardNameColor: '#cccccc',
  cardNameLines: 1,

  // Price
  priceFontSize: 14,
  priceColor: '#ffffff',
  priceFontWeight: 'bold',
  pricePrefix: '',
  priceShowYen: false,
  priceFormat: 'comma', // comma, plain
  priceNullText: '-',
  priceMarginTop: 2,
  priceStroke: false,
  priceStrokeColor: '#000000',
  priceStrokeWidth: 2,
  priceBgFullWidth: false,
  priceBgEnabled: false,
  priceBgColor: '#000000',
  priceBgRadius: 4,
  priceBgPaddingX: 6,
  priceBgPaddingY: 2,

  // Placeholder (空きスロット埋め)
  fillEmptySlots: true,
  placeholderImage: './card-back.jpg',

  // Update date
  showUpdateDate: false,
  updateDateFontSize: 12,
  updateDateColor: '#888888',
  updateDateAlign: 'right', // left, center, right
  updateDatePosition: 'bottom', // top, bottom

  // Footer
  footerText: 'カードの傷およびケース傷、カード在庫状況等による増減がございますので予めご了承ください',
  footerFontSize: 10,
  footerColor: '#888888',
  footerShow: true,
}

export const TEMPLATE_PRESETS = [
  {
    name: 'ダーク×ゴールド',
    settings: {
      bgColor: '#1a1a2e',
      headerColor: '#ffd700',
      priceColor: '#ffffff',
      cardBgColor: '#2a2a3e',
      cardBorderColor: '#333333',
      psaBadgeColor: '#ff0000',
    }
  },
  {
    name: 'ホワイト×ブルー',
    settings: {
      bgColor: '#f0f4f8',
      headerColor: '#1e40af',
      priceColor: '#1e293b',
      cardBgColor: '#ffffff',
      cardBorderColor: '#cbd5e1',
      psaBadgeColor: '#2563eb',
      cardNameColor: '#475569',
      footerColor: '#64748b',
    }
  },
  {
    name: 'ブラック×レッド',
    settings: {
      bgColor: '#0a0a0a',
      headerColor: '#ef4444',
      priceColor: '#fbbf24',
      cardBgColor: '#1c1c1c',
      cardBorderColor: '#ef4444',
      psaBadgeColor: '#ef4444',
    }
  },
]
