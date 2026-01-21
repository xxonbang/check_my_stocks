import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const STOCKS_PATH = path.join(ROOT_DIR, "data", "stocks.json");
const SCREENSHOTS_DIR = path.join(ROOT_DIR, "public", "screenshots");
const RESULTS_PATH = path.join(ROOT_DIR, "data", "analysis_results.json");

// 세 개의 API 키 지원 (fallback 방식)
const API_KEYS = [
  process.env.GEMINI_API_KEY_01,
  process.env.GEMINI_API_KEY_02,
  process.env.GEMINI_API_KEY_03,
].filter(Boolean);

if (API_KEYS.length === 0) {
  console.error(
    "Error: No GEMINI_API_KEY_01, GEMINI_API_KEY_02, or GEMINI_API_KEY_03 environment variable is set",
  );
  process.exit(1);
}

console.log(`Loaded ${API_KEYS.length} API key(s)`);

function loadStocks() {
  const data = fs.readFileSync(STOCKS_PATH, "utf-8");
  return JSON.parse(data).stocks;
}

function loadImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

// 숫자 문자열에서 숫자만 추출
function parsePrice(value) {
  if (value === null || value === undefined || value === 'N/A') return null;
  const str = String(value).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// 추출된 데이터의 논리적 일관성 검증
function validateExtractedData(data, stockName) {
  const warnings = [];

  const currentPrice = parsePrice(data.currentPrice);
  const prevClose = parsePrice(data.prevClose);
  const openPrice = parsePrice(data.openPrice);
  const highPrice = parsePrice(data.highPrice);
  const lowPrice = parsePrice(data.lowPrice);

  // 시가와 전일이 동일한 경우 경고 (다를 수 있음)
  if (openPrice !== null && prevClose !== null && openPrice === prevClose) {
    warnings.push(`시가(${openPrice})와 전일(${prevClose})이 동일함 - 확인 필요`);
  }

  // 고가 >= 시가 검증
  if (highPrice !== null && openPrice !== null && highPrice < openPrice) {
    warnings.push(`고가(${highPrice}) < 시가(${openPrice}) - 비정상적인 데이터`);
  }

  // 저가 <= 시가 검증
  if (lowPrice !== null && openPrice !== null && lowPrice > openPrice) {
    warnings.push(`저가(${lowPrice}) > 시가(${openPrice}) - 비정상적인 데이터`);
  }

  // 고가 >= 저가 검증
  if (highPrice !== null && lowPrice !== null && highPrice < lowPrice) {
    warnings.push(`고가(${highPrice}) < 저가(${lowPrice}) - 비정상적인 데이터`);
  }

  // 현재가가 고가/저가 범위 내인지 검증
  if (currentPrice !== null && highPrice !== null && currentPrice > highPrice) {
    warnings.push(`현재가(${currentPrice}) > 고가(${highPrice}) - 비정상적인 데이터`);
  }

  if (currentPrice !== null && lowPrice !== null && currentPrice < lowPrice) {
    warnings.push(`현재가(${currentPrice}) < 저가(${lowPrice}) - 비정상적인 데이터`);
  }

  if (warnings.length > 0) {
    console.warn(`[${stockName}] 데이터 검증 경고:`);
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  return warnings;
}

function buildSingleStockPrompt(stock) {
  return `[Role] 당신은 전문 ETF/주식 분석가이자 데이터 추출 전문가입니다.

[Task]
이 이미지는 "${stock.name}" (종목코드: ${stock.code})의 네이버 증권 상세 페이지입니다.

**[매우 중요] 테이블 데이터 추출 시 주의사항:**

1. **레이블-값 매핑 필수**: 테이블에서 각 레이블(예: "전일", "시가", "고가") 바로 옆 또는 아래에 있는 숫자가 해당 레이블의 값입니다.
   - "전일" 옆의 숫자 → prevClose
   - "시가" 옆의 숫자 → openPrice
   - "고가" 옆의 숫자 → highPrice
   - "저가" 옆의 숫자 → lowPrice

2. **테이블 레이아웃 구조**: 네이버 증권의 가격 정보 테이블은 다음과 같이 구성됩니다:
   | 전일 [값1] | 시가 [값2] | 고가 [값3] |
   | 저가 [값4] | 거래량 [값5] | 대금 [값6] |
   각 레이블 바로 옆의 숫자만 해당 필드에 할당하세요.

3. **숫자 추출 주의사항:**
   - 숫자를 한 글자씩 정확히 읽으세요
   - 쉼표(,)의 위치를 확인하여 자릿수를 정확히 파악하세요
   - 첫 번째 숫자를 절대 누락하지 마세요

4. **논리적 검증**: 추출 후 다음을 반드시 확인하세요:
   - 저가 ≤ 시가 ≤ 고가 (일반적인 경우)
   - 저가 ≤ 현재가 ≤ 고가
   - 전일과 시가는 다른 값일 수 있습니다 (동일하지 않을 수 있음)

**[추출할 데이터 목록]**
이미지에서 다음 항목들을 모두 찾아 정확히 추출하세요:

1. 가격 정보:
   - 현재가 (currentPrice) - 페이지 상단의 가장 큰 숫자
   - 전일 대비 변동금액 (priceChange)
   - 등락률 (changePercent)
   - 전일 종가 (prevClose) - "전일" 레이블 옆의 값
   - 시가 (openPrice) - "시가" 레이블 옆의 값 (전일과 다를 수 있음!)
   - 고가 (highPrice) - "고가" 레이블 옆의 값
   - 저가 (lowPrice) - "저가" 레이블 옆의 값

2. 거래 정보:
   - 거래량 (volume)
   - 거래대금 (tradingValue)

3. 52주 정보:
   - 52주 최고 (high52week)
   - 52주 최저 (low52week)

4. ETF 핵심 지표:
   - iNAV (inav) - 실시간 추정 순자산가치
   - NAV (nav) - 순자산가치
   - 괴리율 (premiumDiscount)
   - 시가총액 (marketCap)
   - 운용자산(AUM) (aum)
   - 총보수 (expenseRatio)
   - 배당수익률 (dividendYield)

5. 수익률 정보:
   - 1개월 수익률 (return1m)
   - 3개월 수익률 (return3m)
   - 1년 수익률 (return1y)

6. 투자자별 매매동향 (investorTrend):
   - 개인, 외국인, 기관 순매수/순매도 현황

7. **[중요] 일봉 차트 기술적 분석 (chartAnalysis):**
   이미지에 표시된 일봉 차트를 분석하여 다음 지표들을 추출/계산하세요:
   - 추세 (trend): "상승", "하락", "횡보" 중 하나
   - 5일 이동평균선 추정값 (ma5): 차트에서 읽을 수 있다면 기재
   - 20일 이동평균선 추정값 (ma20): 차트에서 읽을 수 있다면 기재
   - 60일 이동평균선 추정값 (ma60): 차트에서 읽을 수 있다면 기재
   - 단기 지지선 (support): 차트에서 확인되는 지지 가격대
   - 단기 저항선 (resistance): 차트에서 확인되는 저항 가격대
   - 차트 패턴 (pattern): "골든크로스", "데드크로스", "삼각수렴", "상승쐐기", "하락쐐기", "박스권", "돌파", "이탈" 등
   - 이동평균선 배열 (maAlignment): "정배열", "역배열", "수렴" 중 하나
   - 매매 시그널 (signal): "매수", "매도", "관망" 중 하나

**[리포트 작성 지침]**
추출한 모든 데이터를 기반으로 종합적인 AI 분석 리포트를 작성하세요:

[분석에 반드시 포함할 내용]
- 일봉 차트 패턴 분석 (이미지에서 확인되는 추세, 지지/저항선, 패턴)
- NAV 대비 괴리율 분석 (프리미엄/디스카운트 상태)
- 수익률 추이 분석 (1개월/3개월/1년 수익률 비교)
- 투자자별 매매동향 해석 (수급 분석)
- 거래량/거래대금 분석

[리포트 포맷 - 마크다운 형식]
## 기술적 분석
(차트 패턴, 이동평균선, 지지/저항선 분석)

## 펀더멘털 분석
(NAV, 괴리율, 운용자산, 총보수 기반 분석)

## 수익률 분석
(1개월/3개월/1년 수익률 트렌드)

## 수급 분석
(투자자별 매매동향 해석)

## 단기 전망 (1주일)
(구체적인 예상 가격대 및 근거)

## 장기 전망 (1개월 이상)
(추세 전망 및 목표가)

## 긍정적 요인
(상승 모멘텀)

## 부정적 요인
(리스크 요소)

## 투자 시 유의사항
(투자 전략 및 주의점)

결과는 아래 JSON 구조로 출력하세요. JSON만 출력하고 다른 텍스트는 포함하지 마세요:

{
  "code": "${stock.code}",
  "name": "${stock.name}",
  "extracted_data": {
    "currentPrice": "현재가",
    "priceChange": "변동금액",
    "changePercent": "등락률",
    "prevClose": "전일",
    "openPrice": "시가",
    "highPrice": "고가",
    "lowPrice": "저가",
    "volume": "거래량",
    "tradingValue": "거래대금",
    "high52week": "52주 최고",
    "low52week": "52주 최저",
    "inav": "iNAV",
    "nav": "NAV",
    "premiumDiscount": "괴리율",
    "marketCap": "시가총액",
    "aum": "운용자산",
    "expenseRatio": "총보수",
    "dividendYield": "배당수익률",
    "return1m": "1개월 수익률",
    "return3m": "3개월 수익률",
    "return1y": "1년 수익률",
    "investorTrend": {
      "individual": "개인 순매수/순매도",
      "foreign": "외국인 순매수/순매도",
      "institution": "기관 순매수/순매도"
    },
    "chartAnalysis": {
      "trend": "상승/하락/횡보",
      "ma5": "5일 이평선 (추정값 또는 null)",
      "ma20": "20일 이평선 (추정값 또는 null)",
      "ma60": "60일 이평선 (추정값 또는 null)",
      "support": "지지선 가격",
      "resistance": "저항선 가격",
      "pattern": "차트 패턴명",
      "maAlignment": "정배열/역배열/수렴",
      "signal": "매수/매도/관망"
    }
  },
  "ai_report": "AI 분석 리포트 내용 (마크다운 형식)",
  "prediction": "Bullish/Bearish/Neutral"
}`;
}

async function analyzeWithKey(apiKey, keyIndex, prompt, imageParts) {
  console.log(`Trying API key #${keyIndex + 1}...`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.2,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 16384,
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
      mimeType: "image/png",
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
      console.error(
        `[${stock.name}] API key #${i + 1} failed: ${error.message}`,
      );
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
    console.log(
      `[${stock.name}] Done - Price: ${result.extracted_data?.currentPrice}`,
    );

    // 추출된 데이터 검증
    if (result.extracted_data) {
      const warnings = validateExtractedData(result.extracted_data, stock.name);
      if (warnings.length > 0) {
        result.dataValidationWarnings = warnings;
      }
    }

    return result;
  } catch (e) {
    console.error(`[${stock.name}] Failed to parse JSON:`, e.message);
    return null;
  }
}

async function analyzeStocks(stocks) {
  console.log(
    `\nAnalyzing ${stocks.length} stocks individually with Gemini 2.5 Flash...`,
  );

  const results = [];

  for (const stock of stocks) {
    const result = await analyzeSingleStock(stock);
    if (result) {
      results.push(result);
    }
    // API 호출 간 잠시 대기 (rate limit 방지)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { stocks: results };
}

async function main() {
  console.log("=== Stock Analyzer Started ===");
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
    const publicDataPath = path.join(
      ROOT_DIR,
      "public",
      "data",
      "analysis_results.json",
    );
    fs.writeFileSync(publicDataPath, JSON.stringify(finalResult, null, 2));

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Results saved to: ${RESULTS_PATH}`);
    console.log(`Analyzed ${finalResult.stocks?.length || 0} stocks`);
  } catch (error) {
    console.error("Analysis failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
