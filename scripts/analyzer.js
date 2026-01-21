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

function buildPrompt(stocks) {
  const stockList = stocks.map(s => `- ${s.name} (${s.code})`).join('\n');

  return `[Role] 당신은 전문 주식 분석가이자 데이터 추출 전문가입니다.

[Task]
1. 첨부된 각 이미지는 다음 주식 종목들의 상세 페이지입니다:
${stockList}

2. 각 이미지에서 다음 데이터를 정확히 추출하세요:
   - 현재가 (currentPrice)
   - 전일 대비 변동금액 (priceChange)
   - 등락률 (changePercent)
   - 거래량 (volume)
   - 시가총액 (marketCap)
   - PER
   - PBR
   - 52주 최고가 (high52week)
   - 52주 최저가 (low52week)
   - 외국인 보유율 (foreignOwnership) - 있는 경우

3. 각 종목에 대해 현재 시장 상황과 차트 패턴을 분석하여 간단한 AI 전망 리포트를 작성하세요.
   - 기술적 분석 관점의 의견
   - 단기 전망 (1주일)
   - 투자 시 유의사항

4. 모든 결과는 아래 JSON 구조를 엄격히 따라야 합니다. JSON만 출력하고 다른 텍스트는 포함하지 마세요:

{
  "stocks": [
    {
      "code": "종목코드",
      "name": "종목명",
      "extracted_data": {
        "currentPrice": "현재가",
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
    }
  ]
}`;
}

async function analyzeWithKey(apiKey, keyIndex, prompt, imageParts) {
  console.log(`Trying API key #${keyIndex + 1}...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 8192,
    },
  });

  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  return response.text();
}

async function analyzeStocks(stocks) {
  const imageParts = [];
  const validStocks = [];

  for (const stock of stocks) {
    const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

    if (!fs.existsSync(imagePath)) {
      console.log(`[${stock.name}] Screenshot not found, skipping...`);
      continue;
    }

    const imageBase64 = loadImageAsBase64(imagePath);
    imageParts.push({
      inlineData: {
        mimeType: 'image/png',
        data: imageBase64,
      },
    });
    validStocks.push(stock);
    console.log(`[${stock.name}] Image loaded`);
  }

  if (validStocks.length === 0) {
    throw new Error('No valid stock screenshots found');
  }

  const prompt = buildPrompt(validStocks);
  console.log(`\nAnalyzing ${validStocks.length} stocks with Gemini 2.5 Flash...`);

  let text = null;
  let lastError = null;

  // API 키를 순차적으로 시도 (fallback)
  for (let i = 0; i < API_KEYS.length; i++) {
    try {
      text = await analyzeWithKey(API_KEYS[i], i, prompt, imageParts);
      console.log(`API key #${i + 1} succeeded`);
      break;
    } catch (error) {
      console.error(`API key #${i + 1} failed: ${error.message}`);
      lastError = error;
    }
  }

  if (!text) {
    throw lastError || new Error('All API keys failed');
  }

  // JSON 추출 (코드 블록 내에 있을 수 있음)
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse JSON response:', e.message);
    console.error('Raw response:', text);
    throw new Error('Invalid JSON response from Gemini API');
  }
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
