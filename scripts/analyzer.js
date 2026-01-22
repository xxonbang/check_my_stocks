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

// ============================================
// 멀티 프로바이더 설정
// ============================================

// Provider 1: Gemini API (기존)
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_01,
  process.env.GEMINI_API_KEY_02,
  process.env.GEMINI_API_KEY_03,
].filter(Boolean);

// Provider 2: OpenRouter API (Gemini 3 Flash:free)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Provider 3: Groq API (Llama 3.3)
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Provider 4: Cloudflare Workers AI
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

// 프로바이더 우선순위 및 상태 추적
const providers = {
  openrouter: { name: "OpenRouter (Gemini Flash)", enabled: !!OPENROUTER_API_KEY, failed: false },
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
  groq: { name: "Groq (Llama 3.3)", enabled: !!GROQ_API_KEY, failed: false },
  cloudflare: { name: "Cloudflare (Llama 3.2 Vision)", enabled: !!(CF_ACCOUNT_ID && CF_API_TOKEN), failed: false },
};

// 현재 작동 중인 프로바이더
let currentProvider = null;
let currentGeminiKeyIndex = 0;

console.log("=== Provider Status ===");
Object.entries(providers).forEach(([key, p]) => {
  console.log(`${p.name}: ${p.enabled ? "✓ Enabled" : "✗ Disabled"}`);
});

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
  if (value === null || value === undefined || value === "N/A") return null;
  const str = String(value).replace(/[^0-9.-]/g, "");
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

  if (openPrice !== null && prevClose !== null && openPrice === prevClose) {
    warnings.push(`시가(${openPrice})와 전일(${prevClose})이 동일함 - 확인 필요`);
  }

  if (highPrice !== null && openPrice !== null && highPrice < openPrice) {
    warnings.push(`고가(${highPrice}) < 시가(${openPrice}) - 비정상적인 데이터`);
  }

  if (lowPrice !== null && openPrice !== null && lowPrice > openPrice) {
    warnings.push(`저가(${lowPrice}) > 시가(${openPrice}) - 비정상적인 데이터`);
  }

  if (highPrice !== null && lowPrice !== null && highPrice < lowPrice) {
    warnings.push(`고가(${highPrice}) < 저가(${lowPrice}) - 비정상적인 데이터`);
  }

  if (currentPrice !== null && highPrice !== null && currentPrice > highPrice) {
    warnings.push(`현재가(${currentPrice}) > 고가(${highPrice}) - 비정상적인 데이터`);
  }

  if (currentPrice !== null && lowPrice !== null && currentPrice < lowPrice) {
    warnings.push(`현재가(${currentPrice}) < 저가(${lowPrice}) - 비정상적인 데이터`);
  }

  if (warnings.length > 0) {
    console.warn(`[${stockName}] 데이터 검증 경고:`);
    warnings.forEach((w) => console.warn(`  - ${w}`));
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

// ============================================
// Provider 1: OpenRouter API (Gemini Flash:free)
// ============================================
async function analyzeWithOpenRouter(prompt, imageBase64) {
  console.log("  → Trying OpenRouter (Gemini Flash:free)...");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/xxonbang/check_my_stocks",
      "X-Title": "Check My Stocks"
    },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-exp:free",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16384,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// Provider 2: Gemini API (기존)
// ============================================
async function analyzeWithGemini(prompt, imageBase64) {
  console.log(`  → Trying Gemini API (key #${currentGeminiKeyIndex + 1})...`);

  for (let i = currentGeminiKeyIndex; i < GEMINI_API_KEYS.length; i++) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[i]);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 16384,
        },
      });

      const imagePart = {
        inlineData: {
          mimeType: "image/png",
          data: imageBase64,
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      currentGeminiKeyIndex = i; // 성공한 키 기억
      return response.text();
    } catch (error) {
      console.log(`    Gemini key #${i + 1} failed: ${error.message}`);
      if (i === GEMINI_API_KEYS.length - 1) {
        throw new Error("All Gemini API keys exhausted");
      }
    }
  }
}

// ============================================
// Provider 3: Groq API (Llama 3.3 - Vision 제한적)
// ============================================
async function analyzeWithGroq(prompt, imageBase64) {
  console.log("  → Trying Groq (Llama 3.3)...");

  // Groq의 Vision 모델 사용 (llama-3.2-90b-vision-preview)
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.2-90b-vision-preview",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 16384,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// Provider 4: Cloudflare Workers AI (Llama 3.2 Vision)
// ============================================
async function analyzeWithCloudflare(prompt, imageBase64) {
  console.log("  → Trying Cloudflare Workers AI (Llama 3.2 Vision)...");

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        image: [imageBase64],
        max_tokens: 16384
      })
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Cloudflare API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(`Cloudflare API error: ${JSON.stringify(data.errors)}`);
  }

  return data.result.response;
}

// ============================================
// Circuit Breaker: 멀티 프로바이더 Fallback
// ============================================
async function analyzeWithFallback(prompt, imageBase64, stockName) {
  const providerOrder = ["openrouter", "gemini", "groq", "cloudflare"];

  // 현재 작동 중인 프로바이더가 있으면 먼저 시도
  if (currentProvider && providers[currentProvider].enabled && !providers[currentProvider].failed) {
    providerOrder.splice(providerOrder.indexOf(currentProvider), 1);
    providerOrder.unshift(currentProvider);
  }

  for (const providerKey of providerOrder) {
    const provider = providers[providerKey];

    if (!provider.enabled || provider.failed) {
      continue;
    }

    try {
      let result;

      switch (providerKey) {
        case "openrouter":
          result = await analyzeWithOpenRouter(prompt, imageBase64);
          break;
        case "gemini":
          result = await analyzeWithGemini(prompt, imageBase64);
          break;
        case "groq":
          result = await analyzeWithGroq(prompt, imageBase64);
          break;
        case "cloudflare":
          result = await analyzeWithCloudflare(prompt, imageBase64);
          break;
      }

      // 성공 시 현재 프로바이더로 설정
      if (currentProvider !== providerKey) {
        console.log(`  ✓ Switching to ${provider.name} for subsequent requests`);
        currentProvider = providerKey;
      }

      return result;

    } catch (error) {
      console.error(`  ✗ ${provider.name} failed: ${error.message}`);

      // 429 (Rate Limit) 또는 503 (Service Unavailable) 에러 시 프로바이더 비활성화
      if (error.message.includes("429") || error.message.includes("503") || error.message.includes("exhausted")) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);
      }
    }
  }

  throw new Error(`[${stockName}] All providers failed`);
}

// ============================================
// JSON 파싱 및 정리
// ============================================
function sanitizeJsonString(str) {
  return str.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match, content) => {
    const sanitized = content
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return `"${sanitized}"`;
  });
}

function parseJsonResponse(text, stockName) {
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    console.log(`[${stockName}] First JSON parse failed, sanitizing...`);
    try {
      const sanitizedJson = sanitizeJsonString(jsonStr);
      return JSON.parse(sanitizedJson);
    } catch (secondError) {
      console.error(`[${stockName}] Failed to parse JSON:`, secondError.message);
      return null;
    }
  }
}

// ============================================
// 단일 종목 분석
// ============================================
async function analyzeSingleStock(stock) {
  const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

  if (!fs.existsSync(imagePath)) {
    console.log(`[${stock.name}] Screenshot not found, skipping...`);
    return null;
  }

  const imageBase64 = loadImageAsBase64(imagePath);
  const prompt = buildSingleStockPrompt(stock);

  console.log(`[${stock.name}] Analyzing...`);

  try {
    const text = await analyzeWithFallback(prompt, imageBase64, stock.name);
    const result = parseJsonResponse(text, stock.name);

    if (!result) {
      return null;
    }

    console.log(`[${stock.name}] Done - Price: ${result.extracted_data?.currentPrice}`);

    // 추출된 데이터 검증
    if (result.extracted_data) {
      const warnings = validateExtractedData(result.extracted_data, stock.name);
      if (warnings.length > 0) {
        result.dataValidationWarnings = warnings;
      }
    }

    return result;
  } catch (error) {
    console.error(`[${stock.name}] Analysis failed: ${error.message}`);
    return null;
  }
}

// ============================================
// 전체 종목 분석
// ============================================
async function analyzeStocks(stocks) {
  console.log(`\nAnalyzing ${stocks.length} stocks with multi-provider fallback...`);

  const results = [];

  for (const stock of stocks) {
    const result = await analyzeSingleStock(stock);
    if (result) {
      results.push(result);
    }
    // API 호출 간 잠시 대기 (rate limit 방지)
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return { stocks: results };
}

// ============================================
// 메인 함수
// ============================================
async function main() {
  console.log("\n=== Stock Analyzer Started ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("Multi-Provider Fallback: OpenRouter → Gemini → Groq → Cloudflare\n");

  const stocks = loadStocks();
  console.log(`Loaded ${stocks.length} stocks`);

  try {
    const analysisResult = await analyzeStocks(stocks);

    const finalResult = {
      lastUpdated: new Date().toISOString(),
      provider: currentProvider || "unknown",
      ...analysisResult,
    };

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(finalResult, null, 2));

    const publicDataPath = path.join(ROOT_DIR, "public", "data", "analysis_results.json");
    fs.writeFileSync(publicDataPath, JSON.stringify(finalResult, null, 2));

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Results saved to: ${RESULTS_PATH}`);
    console.log(`Analyzed ${finalResult.stocks?.length || 0} stocks`);
    console.log(`Final provider used: ${providers[currentProvider]?.name || "None"}`);
  } catch (error) {
    console.error("Analysis failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
