import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const STOCKS_PATH = path.join(ROOT_DIR, 'data', 'stocks.json');
const SCREENSHOTS_DIR = path.join(ROOT_DIR, 'public', 'screenshots');
const RESULTS_PATH = path.join(ROOT_DIR, 'data', 'analysis_results.json');

// 두 개의 API 키 지원 (fallback 방식)
const API_KEYS = [
  process.env.GEMINI_API_KEY_01,
  process.env.GEMINI_API_KEY_02,
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error('Error: No GEMINI_API_KEY_01 or GEMINI_API_KEY_02 environment variable is set');
  process.exit(1);
}

console.log(`Loaded ${API_KEYS.length} API key(s)`);

function loadStocks() {
  const data = fs.readFileSync(STOCKS_PATH, 'utf-8');
  return JSON.parse(data).stocks;
}

function loadImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString('base64');
}

function buildSingleStockPrompt(stock) {
  return `[Role] 당신은 전문 주식 분석가이자 데이터 추출 전문가입니다.

[Task]
이 이미지는 "${stock.name}" (종목코드: ${stock.code})의 네이버 증권 상세 페이지입니다.

**[매우 중요] 숫자 추출 시 주의사항:**
- 이미지 상단 왼쪽에 크게 표시된 숫자가 "현재가"입니다
- 숫자를 한 글자씩 정확히 읽으세요
- 쉼표(,)의 위치를 확인하여 자릿수를 정확히 파악하세요
- 예시: "740,000"은 74만원, "149,500"은 14만 9천 5백원입니다
- 첫 번째 숫자를 절대 누락하지 마세요
- 한국 대형주(삼성전자, SK하이닉스 등)는 10만원~100만원대일 수 있습니다

다음 데이터를 정확히 추출하세요:
- 현재가 (currentPrice) - 페이지 상단의 가장 큰 숫자, 쉼표 포함하여 정확히
- 전일 대비 변동금액 (priceChange)
- 등락률 (changePercent)
- 거래량 (volume)
- 시가총액 (marketCap)
- PER
- PBR
- 52주 최고가 (high52week)
- 52주 최저가 (low52week)
- 외국인 보유율 (foreignOwnership) - 있는 경우

현재 시장 상황과 차트 패턴을 분석하여 AI 전망 리포트를 작성하세요:
- 기술적 분석 관점의 의견
- 단기 전망 (1주일)
- 투자 시 유의사항

결과는 아래 JSON 구조로 출력하세요. JSON만 출력하고 다른 텍스트는 포함하지 마세요:

{
  "code": "${stock.code}",
  "name": "${stock.name}",
  "extracted_data": {
    "currentPrice": "현재가 (예: 740,000)",
    "priceChange": "변동금액",
    "changePercent": "등락률",
    "volume": "거래량",
    "marketCap": "시가총액",
    "per": "PER",
    "pbr": "PBR",
    "high52week": "52주 최고",
    "low52week": "52주 최저",
    "foreignOwnership": "외국인 보유율"
  },
  "ai_report": "AI 분석 리포트 내용 (마크다운 형식)",
  "prediction": "Bullish/Bearish/Neutral"
}`;
}

async function analyzeWithKey(apiKey, keyIndex, prompt, imageParts) {
  console.log(`Trying API key #${keyIndex + 1}...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.2,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });

  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  return response.text();
}

async function analyzeSingleStock(stock, apiKeyIndex = 0) {
  const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

  if (!fs.existsSync(imagePath)) {
    console.log(`[${stock.name}] Screenshot not found, skipping...`);
    return null;
  }

  const imageBase64 = loadImageAsBase64(imagePath);
  const imagePart = {
    inlineData: {
      mimeType: 'image/png',
      data: imageBase64,
    },
  };

  const prompt = buildSingleStockPrompt(stock);
  console.log(`[${stock.name}] Analyzing...`);

  let text = null;
  let lastError = null;

  // API 키를 순차적으로 시도 (fallback)
  for (let i = apiKeyIndex; i < API_KEYS.length; i++) {
    try {
      text = await analyzeWithKey(API_KEYS[i], i, prompt, [imagePart]);
      break;
    } catch (error) {
      console.error(`[${stock.name}] API key #${i + 1} failed: ${error.message}`);
      lastError = error;
    }
  }

  if (!text) {
    console.error(`[${stock.name}] All API keys failed`);
    return null;
  }

  // JSON 추출 (코드 블록 내에 있을 수 있음)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const result = JSON.parse(jsonStr);
    console.log(`[${stock.name}] Done - Price: ${result.extracted_data?.currentPrice}`);
    return result;
  } catch (e) {
    console.error(`[${stock.name}] Failed to parse JSON:`, e.message);
    return null;
  }
}

async function analyzeStocks(stocks) {
  console.log(`\nAnalyzing ${stocks.length} stocks individually with Gemini 2.5 Flash...`);

  const results = [];

  for (const stock of stocks) {
    const result = await analyzeSingleStock(stock);
    if (result) {
      results.push(result);
    }
    // API 호출 간 잠시 대기 (rate limit 방지)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return { stocks: results };
}

async function main() {
  console.log('=== Stock Analyzer Started ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Model: Gemini 2.5 Flash`);

  const stocks = loadStocks();
  console.log(`Loaded ${stocks.length} stocks`);

  try {
    const analysisResult = await analyzeStocks(stocks);

    // 결과에 타임스탬프 추가
    const finalResult = {
      lastUpdated: new Date().toISOString(),
      ...analysisResult,
    };

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(finalResult, null, 2));

    // public/data에도 복사
    const publicDataPath = path.join(ROOT_DIR, 'public', 'data', 'analysis_results.json');
    fs.writeFileSync(publicDataPath, JSON.stringify(finalResult, null, 2));

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Results saved to: ${RESULTS_PATH}`);
    console.log(`Analyzed ${finalResult.stocks?.length || 0} stocks`);

  } catch (error) {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
