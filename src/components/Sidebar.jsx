import { useState } from 'react'
import AccordionSection from './AccordionSection.jsx'
import ExcelUploader from './ExcelUploader.jsx'
import TemplateManager from './TemplateManager.jsx'
import CanvasSettings from './settings/CanvasSettings.jsx'
import BackgroundSettings from './settings/BackgroundSettings.jsx'
import HeaderSettings from './settings/HeaderSettings.jsx'
import GridSettings from './settings/GridSettings.jsx'
import PsaSettings from './settings/PsaSettings.jsx'
import TextSettings from './settings/TextSettings.jsx'
import PriceSettings from './settings/PriceSettings.jsx'
import FooterSettings from './settings/FooterSettings.jsx'
import CardSelector from './CardSelector.jsx'
import ExportButtons from './ExportButtons.jsx'

export default function Sidebar({ allCards, setAllCards, cards, setCards, settings, updateSettings, setSettings }) {
  const selectedCount = cards.length

  return (
    <div className="w-[440px] min-w-[440px] h-screen overflow-y-auto bg-white border-r border-[#e0d9c8] flex flex-col">
      <div className="px-5 py-4 border-b border-[#e0d9c8] bg-[#faf6ed] sticky top-0 z-10">
        <h1 className="text-lg font-bold text-[#3a3530] flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4a517" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          買取表ジェネレーター
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <AccordionSection title="データ読み込み" defaultOpen>
          <ExcelUploader
            allCards={allCards}
            setAllCards={setAllCards}
            setCards={setCards}
          />
        </AccordionSection>

        <AccordionSection title="テンプレート">
          <TemplateManager settings={settings} setSettings={setSettings} />
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
          <GridSettings settings={settings} update={updateSettings} />
        </AccordionSection>

        <AccordionSection title="PSAロゴ設定">
          <PsaSettings settings={settings} update={updateSettings} />
        </AccordionSection>

        <AccordionSection title="カード名テキスト設定">
          <TextSettings settings={settings} update={updateSettings} />
        </AccordionSection>

        <AccordionSection title="買取価格テキスト設定">
          <PriceSettings settings={settings} update={updateSettings} />
        </AccordionSection>

        <AccordionSection title="フッター設定">
          <FooterSettings settings={settings} update={updateSettings} />
        </AccordionSection>

        <AccordionSection title={`カード選択（${selectedCount}枚）`} defaultOpen>
          <CardSelector
            allCards={allCards}
            cards={cards}
            setCards={setCards}
          />
        </AccordionSection>
      </div>

      <ExportButtons cards={cards} settings={settings} />
    </div>
  )
}
