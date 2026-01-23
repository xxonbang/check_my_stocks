import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const STOCKS_PATH = path.join(ROOT_DIR, 'data', 'stocks.json');
const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'public', 'screenshots');

// 특정 종목 분석 지원
const TARGET_STOCK_CODE = process.env.TARGET_STOCK_CODE || '';
const TARGET_STOCK_NAME = process.env.TARGET_STOCK_NAME || '';

async function loadStocks() {
  // 특정 종목이 지정된 경우 해당 종목만 반환
  if (TARGET_STOCK_CODE) {
    console.log(`[Single Stock Mode] Targeting: ${TARGET_STOCK_NAME || TARGET_STOCK_CODE} (${TARGET_STOCK_CODE})`);
    return [{ code: TARGET_STOCK_CODE, name: TARGET_STOCK_NAME || TARGET_STOCK_CODE }];
  }

  // 전체 종목 분석
  const data = fs.readFileSync(STOCKS_PATH, 'utf-8');
  return JSON.parse(data).stocks;
}

function getNaverStockUrl(code) {
  return `https://m.stock.naver.com/domestic/stock/${code}/total`;
}

async function captureStockPage(page, stock) {
  const url = getNaverStockUrl(stock.code);
  console.log(`[${stock.name}] Navigating to ${url}`);

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // 추가 렌더링 대기
    await page.waitForTimeout(2000);

    // 스크롤하여 전체 콘텐츠 로드
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });

    await page.waitForTimeout(1000);

    const screenshotPath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });

    console.log(`[${stock.name}] Screenshot saved: ${screenshotPath}`);
    return { success: true, path: screenshotPath };
  } catch (error) {
    console.error(`[${stock.name}] Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('=== Stock Scraper Started ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // screenshots 디렉토리 확인/생성
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const stocks = await loadStocks();
  console.log(`Loaded ${stocks.length} stocks from stocks.json`);

  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 2000 },
    deviceScaleFactor: 2,
    locale: 'ko-KR',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  const results = [];
  for (const stock of stocks) {
    const result = await captureStockPage(page, stock);
    results.push({
      ...stock,
      ...result,
    });
  }

  await browser.close();

  // 결과 요약
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n=== Scraping Complete ===');
  console.log(`Success: ${successful}, Failed: ${failed}`);

  // 스크래핑 메타데이터 저장
  const metadata = {
    timestamp: new Date().toISOString(),
    results: results.map(r => ({
      code: r.code,
      name: r.name,
      success: r.success,
      error: r.error || null,
    })),
  };

  fs.writeFileSync(
    path.join(ROOT_DIR, 'data', 'scrape_metadata.json'),
    JSON.stringify(metadata, null, 2)
  );

  if (failed > 0) {
    console.log('\nFailed stocks:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name} (${r.code}): ${r.error}`);
    });
  }
}

main().catch(console.error);
