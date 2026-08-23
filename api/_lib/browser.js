import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium-min'

let browserPromise = null

async function launchBrowser() {
  const localExecutable = process.env.PUPPETEER_EXECUTABLE_PATH
  const packUrl = process.env.CHROMIUM_PACK_URL
  if (!localExecutable && !packUrl) {
    throw new Error('CHROMIUM_PACK_URL is not configured')
  }

  chromium.setGraphicsMode = false
  const headless = 'shell'
  return puppeteer.launch({
    args: localExecutable
      ? await puppeteer.defaultArgs({ headless })
      : await puppeteer.defaultArgs({ args: chromium.args, headless }),
    defaultViewport: {
      deviceScaleFactor: 1,
      hasTouch: false,
      height: 1080,
      isLandscape: false,
      isMobile: false,
      width: 1440,
    },
    executablePath: localExecutable || await chromium.executablePath(packUrl),
    headless,
  })
}

export async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error) => {
      console.error('Chromium launch failed:', error?.name || 'Error', error?.message || 'unknown')
      browserPromise = null
      throw error
    })
  }
  const browser = await browserPromise
  if (!browser.connected) {
    browserPromise = null
    return getBrowser()
  }
  return browser
}

export async function loadHtmlWithBrowser(url, { timeoutMs = 45_000 } = {}) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs })
    const title = await page.title()
    if (/Just a moment|Checking/i.test(title)) {
      await page.waitForFunction(
        () => !/Just a moment|Checking/i.test(document.title),
        { timeout: 15_000 },
      ).catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 750))
    }
    return { html: await page.content(), finalUrl: page.url() }
  } finally {
    await page.close().catch(() => {})
  }
}
