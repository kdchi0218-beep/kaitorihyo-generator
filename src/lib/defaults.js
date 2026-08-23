export const DEFAULT_SETTINGS = {
  // Pricing rule (納品希望価格 → 表示価格)
  ratePercent: 0,        // 基本の掛け率（金額帯に該当しない時）
  priceFlatAdjust: 0,    // 基本の定額調整（円・正負）
  priceTiers: [],        // 金額帯ルール [{min,max,ratePercent,flatAdjust}]
  priceUnit: 100,        // 端数調整の単位
  priceRounding: 'ceil', // ceil / round / floor

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

  // Rarity overlay (遊戯王のみ・rarity列をカードにオーバーレイ)
  showRarityOverlay: false,
  rarityOverlayPosition: 'top-left', // top-left/top-right/bottom-left/bottom-right
  rarityOverlayOffsetX: 4,
  rarityOverlayOffsetY: 4,
  rarityOverlayFontSize: 10,
  rarityOverlayColor: '#ffffff',
  rarityOverlayBgEnabled: true,
  rarityOverlayBgColor: '#b8860b',
  rarityOverlayRadius: 4,
  rarityAliases: {}, // { "20thシークレット": "SE", ... } レアリティ→略称
  rarityHidden: {},  // { "ノーマル": true, ... } true のレアリティはオーバーレイ非表示

  // Card name
  showCardName: true,
  cardNameFontSize: 9,
  cardNameColor: '#cccccc',
  cardNameLines: 1,
  cardNameBgEnabled: false,
  cardNameBgColor: '#000000',
  cardNameBgFullWidth: false,
  cardNameBgRadius: 4,
  cardNameBgPaddingX: 6,
  cardNameBgPaddingY: 2,

  // List No (型番)
  showListNo: false,
  listNoFontSize: 8,
  listNoColor: '#9aa3b0',
  listNoBgEnabled: false,
  listNoBgColor: '#000000',
  listNoMarginTop: 1,     // 上余白（カード名との距離）
  listNoMarginBottom: 0,  // 下余白
  listNoBgPaddingX: 5,    // 横余白
  listNoBgPaddingY: 1,    // 縦余白

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
  updateDateBgEnabled: false,
  updateDateBgColor: '#000000',
  updateDateFreePos: false, // true で px 単位の自由配置
  updateDateX: 20,
  updateDateY: 20,

  // Footer
  footerText: 'カードの傷およびケース傷、カード在庫状況等による増減がございますので予めご了承ください',
  footerFontSize: 10,
  footerColor: '#888888',
  footerShow: true,
  footerBgEnabled: false,
  footerBgColor: '#000000',
}
