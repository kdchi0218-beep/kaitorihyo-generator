import { useEffect, useState } from 'react'
import AccordionSection from './AccordionSection.jsx'
import GenreTabs from './GenreTabs.jsx'
import StoreSwitcher from './StoreSwitcher.jsx'
import ExcelUploader from './ExcelUploader.jsx'
import GenreExcelUploader from './GenreExcelUploader.jsx'
import TemplateManager from './TemplateManager.jsx'
import CanvasSettings from './settings/CanvasSettings.jsx'
import BackgroundSettings from './settings/BackgroundSettings.jsx'
import HeaderSettings from './settings/HeaderSettings.jsx'
import GridSettings from './settings/GridSettings.jsx'
import CardFrameSettings from './settings/CardFrameSettings.jsx'
import PsaSettings from './settings/PsaSettings.jsx'
import RaritySettings from './settings/RaritySettings.jsx'
import TextSettings from './settings/TextSettings.jsx'
import PriceSettings from './settings/PriceSettings.jsx'
import PricingSettings from './settings/PricingSettings.jsx'
import FooterSettings from './settings/FooterSettings.jsx'
import CardSelector from './CardSelector.jsx'
import CardListPanel from './CardListPanel.jsx'
import HelpGuide from './HelpGuide.jsx'
import ExportButtons from './ExportButtons.jsx'
import { GENRE_BY_KEY } from '../lib/genres.js'
import { supportsRegularLists } from '../lib/inputSources.js'

export default function Sidebar({
  width = 440,
  stores, allStores = [], isAdmin, activeStoreId, setActiveStoreId, onOpenAdmin,
  activeGenre, setActiveGenre, genreMeta, visibleGenreKeys, loadGenreCards,
  inputSource, setInputSource, applyInputImport,
  allCards, setAllCards, cards, setCards, settings, updateSettings, setSettings,
  userEmail, onClearData, onLogout,
}) {
  const selectedCount = cards.length
  const genreLabel = GENRE_BY_KEY[activeGenre]?.label || activeGenre
  // このジャンルの全定番リストが覆っているカードキー（CardListPanelが算出 → CardSelectorのフィルタに渡す）
  const [listedKeys, setListedKeys] = useState(null)
  const listEnabled = supportsRegularLists(inputSource)

  useEffect(() => {
    if (!listEnabled) setListedKeys(null)
  }, [listEnabled])

  return (
    <div style={{ width, minWidth: width, flexShrink: 0 }} className="h-screen overflow-y-auto bg-white border-r border-[#e0e4ea] flex flex-col">
      <div className="px-5 py-3 border-b border-[#e0e4ea] bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-[#1e3a5f]">とんとん 買取表ジェネレーター</h1>
          </div>
          <div className="flex items-center gap-2">
            <HelpGuide />
            <button
              onClick={onLogout}
              className="text-[10px] text-[#8c95a4] hover:text-red-500 cursor-pointer"
            >
              ログアウト
            </button>
          </div>
        </div>
        <div className="text-[10px] text-[#8c95a4] mt-1">
          {userEmail}
          <span className="ml-2 opacity-60" title="バージョン（不具合報告時にこの番号を添えてください）">
            v{typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}
          </span>
        </div>
        <div className="mt-2">
          <StoreSwitcher
            stores={stores}
            isAdmin={isAdmin}
            activeStoreId={activeStoreId}
            setActiveStoreId={setActiveStoreId}
            onOpenAdmin={onOpenAdmin}
          />
        </div>
      </div>

      {/* とんとんは読込済みの1ジャンル、パワンは5ジャンルだけを表示 */}
      <div className="px-4 py-2 border-b border-[#e0e4ea] bg-[#f8f9fb] sticky top-[92px] z-10">
        <GenreTabs
          activeGenre={activeGenre}
          setActiveGenre={setActiveGenre}
          genreMeta={genreMeta}
          visibleGenreKeys={visibleGenreKeys}
        />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <AccordionSection title="データ取得" defaultOpen>
          <div className="text-[11px] font-semibold text-[#1e3a5f] mb-1">入力形式を選んでExcelを読み込み</div>
          <ExcelUploader
            inputSource={inputSource}
            onInputSourceChange={setInputSource}
            onImportComplete={applyInputImport}
          />

          {listEnabled && (
            <details className="mt-2">
              <summary className="text-[11px] text-[#5a6577] cursor-pointer hover:text-[#1e3a5f]">
                {genreLabel}だけ単体で読み込む（パワン形式）
              </summary>
              <div className="mt-2">
                <GenreExcelUploader genre={activeGenre} loadGenreCards={loadGenreCards} />
              </div>
            </details>
          )}

          {allCards.length > 0 && (
            <button
              onClick={() => { if (confirm(`${genreLabel}の読み込みデータをクリアしますか？`)) onClearData() }}
              className="mt-2 w-full text-xs px-2 py-1.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 cursor-pointer"
            >
              このジャンルのデータをクリア
            </button>
          )}
        </AccordionSection>

        <AccordionSection title={`テンプレート（${genreLabel}）`} defaultOpen>
          <TemplateManager settings={settings} setSettings={setSettings} genre={activeGenre} storeId={activeStoreId} stores={allStores} />
        </AccordionSection>

        <AccordionSection title="⚙ 見た目・価格の設定（設定後は折りたたみOK）">
          <div className="space-y-2">
            <AccordionSection title="買取価格ルール（掛け率・端数）">
              <PricingSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="キャンバス・出力設定">
              <CanvasSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="背景設定">
              <BackgroundSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="ヘッダー・ロゴ設定">
              <HeaderSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="カードグリッド設定">
              <GridSettings settings={settings} update={updateSettings} userFormat={activeGenre} />
            </AccordionSection>

            <AccordionSection title="カード枠設定">
              <CardFrameSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="PSAロゴ設定">
              <PsaSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            {activeGenre === 'yugioh' && (
              <AccordionSection title="レアリティ表示（遊戯王）">
                <RaritySettings
                  settings={settings}
                  update={updateSettings}
                  rarities={[...new Set(allCards.map(c => c.rarity).filter(Boolean))].sort()}
                />
              </AccordionSection>
            )}

            <AccordionSection title="カード名テキスト設定">
              <TextSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="買取価格テキスト設定">
              <PriceSettings settings={settings} update={updateSettings} />
            </AccordionSection>

            <AccordionSection title="フッター設定">
              <FooterSettings settings={settings} update={updateSettings} />
            </AccordionSection>
          </div>
        </AccordionSection>

        <AccordionSection title={`カード選択（${genreLabel} ・ ${selectedCount}枚）`} defaultOpen>
          {listEnabled && (
            <div className="mb-2">
              <CardListPanel genre={activeGenre} allCards={allCards} cards={cards} setCards={setCards} storeId={activeStoreId} stores={allStores} settings={settings} onListedKeysChange={setListedKeys} />
            </div>
          )}
          <CardSelector
            key={`${inputSource}:${activeGenre}`}
            allCards={allCards}
            setAllCards={setAllCards}
            cards={cards}
            setCards={setCards}
            listedKeys={listEnabled ? listedKeys : null}
            genre={activeGenre}
          />
        </AccordionSection>
      </div>

      <ExportButtons cards={cards} settings={settings} />
    </div>
  )
}
