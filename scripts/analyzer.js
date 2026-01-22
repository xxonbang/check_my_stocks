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

// Provider: Gemini API (기존)
const GEMINI_API_KEYS = [
  process.env.GEMINI_API_KEY_01,
  process.env.GEMINI_API_KEY_02,
  process.env.GEMINI_API_KEY_03,
].filter(Boolean);

// Provider: OpenRouter API
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Provider: Groq API
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Provider: Cloudflare Workers AI
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

// OpenRouter 무료 Vision 모델 (2026.01 기준)
// - Gemini 3.0 Flash: 유료 ($0.50/M 입력)
// - Gemini 2.5 Flash: 유료 ($0.30/M 입력)
// - Gemini 2.0 Flash Exp: 무료 (2026.02.06 지원종료 예정)
const OPENROUTER_MODELS = [
  "google/gemini-2.0-flash-exp:free",
];

// 프로바이더 상태 추적 (OCR용 Vision 프로바이더)
const visionProviders = {
  openrouter: { name: "OpenRouter (Gemini Flash)", enabled: !!OPENROUTER_API_KEY, failed: false },
  groq: { name: "Groq (Llama Vision)", enabled: !!GROQ_API_KEY, failed: false },
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
  cloudflare: { name: "Cloudflare (Llama Vision)", enabled: !!(CF_ACCOUNT_ID && CF_API_TOKEN), failed: false },
};

// 텍스트 생성 프로바이더 (리포트 작성용)
const textProviders = {
  groq: { name: "Groq (Llama 3.3)", enabled: !!GROQ_API_KEY, failed: false },
  openrouter: { name: "OpenRouter", enabled: !!OPENROUTER_API_KEY, failed: false },
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
};

// 추론 모델 프로바이더 (예측용)
const reasoningProviders = {
  openrouter_deepseek: { name: "OpenRouter (DeepSeek-R1)", enabled: !!OPENROUTER_API_KEY, failed: false },
  openrouter_qwen: { name: "OpenRouter (Qwen QwQ)", enabled: !!OPENROUTER_API_KEY, failed: false },
  groq: { name: "Groq (Llama 3.3)", enabled: !!GROQ_API_KEY, failed: false },
};

// 현재 작동 중인 프로바이더
let currentVisionProvider = null;
let currentTextProvider = null;
let currentReasoningProvider = null;
let currentGeminiKeyIndex = 0;
let currentOpenRouterModelIndex = 0;

console.log("=== Provider Status ===");
console.log("Vision (OCR):");
Object.entries(visionProviders).forEach(([key, p]) => {
  console.log(`  ${p.name}: ${p.enabled ? "✓ Enabled" : "✗ Disabled"}`);
});
console.log("Text (Report):");
Object.entries(textProviders).forEach(([key, p]) => {
  console.log(`  ${p.name}: ${p.enabled ? "✓ Enabled" : "✗ Disabled"}`);
});
console.log("Reasoning (Prediction):");
Object.entries(reasoningProviders).forEach(([key, p]) => {
  console.log(`  ${p.name}: ${p.enabled ? "✓ Enabled" : "✗ Disabled"}`);
});

// ============================================
// 유틸리티 함수
// ============================================

function loadStocks() {
  const data = fs.readFileSync(STOCKS_PATH, "utf-8");
  return JSON.parse(data).stocks;
}

function loadImageAsBase64(imagePath) {
  const imageBuffer = fs.readFileSync(imagePath);
  return imageBuffer.toString("base64");
}

function parsePrice(value) {
  if (value === null || value === undefined || value === "N/A") return null;
  const str = String(value).replace(/[^0-9.-]/g, "");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

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

function parseJsonResponse(text, context) {
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    console.log(`[${context}] First JSON parse failed, sanitizing...`);
    try {
      const sanitizedJson = sanitizeJsonString(jsonStr);
      return JSON.parse(sanitizedJson);
    } catch (secondError) {
      console.error(`[${context}] Failed to parse JSON:`, secondError.message);
      return null;
    }
  }
}

// ============================================
// Phase 1: OCR 프롬프트 (이미지에서 데이터 추출만)
// ============================================

function buildOCRPrompt(stock) {
  return `[Role] 당신은 이미지에서 데이터를 정확하게 추출하는 OCR 전문가입니다.

[Task]
이 이미지는 "${stock.name}" (종목코드: ${stock.code})의 네이버 증권 상세 페이지입니다.
이미지에서 모든 숫자 데이터를 정확히 추출하세요. 분석이나 리포트 작성은 하지 마세요. 오직 데이터 추출만 수행합니다.

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
   - 전일과 시가는 다른 값일 수 있습니다

**[추출할 데이터 목록]**

1. 가격 정보:
   - 현재가 (currentPrice) - 페이지 상단의 가장 큰 숫자
   - 전일 대비 변동금액 (priceChange)
   - 등락률 (changePercent)
   - 전일 종가 (prevClose) - "전일" 레이블 옆의 값
   - 시가 (openPrice) - "시가" 레이블 옆의 값
   - 고가 (highPrice) - "고가" 레이블 옆의 값
   - 저가 (lowPrice) - "저가" 레이블 옆의 값

2. 거래 정보:
   - 거래량 (volume)
   - 거래대금 (tradingValue)

3. 52주 정보:
   - 52주 최고 (high52week)
   - 52주 최저 (low52week)

4. ETF 핵심 지표:
   - iNAV (inav)
   - NAV (nav)
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

7. 차트 기술적 분석 (chartAnalysis):
   - 추세 (trend): "상승", "하락", "횡보" 중 하나
   - 5일/20일/60일 이동평균선 추정값
   - 지지선/저항선 가격대
   - 차트 패턴 (pattern)
   - 이동평균선 배열 (maAlignment)
   - 매매 시그널 (signal)

결과는 아래 JSON 구조로 출력하세요. JSON만 출력하고 다른 텍스트는 포함하지 마세요:

{
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
}`;
}

// ============================================
// Phase 2: 리포트 생성 프롬프트 (텍스트 기반)
// ============================================

function buildReportPrompt(stock, extractedData) {
  return `[Role] 당신은 전문 ETF/주식 분석가입니다. 추출된 데이터를 기반으로 종합 분석 리포트를 작성하세요.

[종목 정보]
- 종목명: ${stock.name}
- 종목코드: ${stock.code}

[추출된 데이터]
${JSON.stringify(extractedData, null, 2)}

[리포트 작성 지침]
위 데이터를 기반으로 종합적인 AI 분석 리포트를 작성하세요.

[분석에 반드시 포함할 내용]
- 차트 패턴 분석 (추세, 지지/저항선, 패턴)
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

## 긍정적 요인
(상승 모멘텀)

## 부정적 요인
(리스크 요소)

## 투자 시 유의사항
(투자 전략 및 주의점)

결과는 마크다운 형식의 리포트 텍스트만 출력하세요. JSON이나 코드 블록은 사용하지 마세요.`;
}

// ============================================
// Phase 3: 예측 프롬프트 (추론 모델용)
// ============================================

function buildPredictionPrompt(stock, extractedData, report) {
  return `[Role] 당신은 깊이 있는 논리적 추론을 수행하는 금융 전문가입니다.

[Task] 아래 데이터와 분석 리포트를 바탕으로 향후 전망을 예측하세요. 반드시 단계별로 논리적 추론 과정을 거쳐 결론을 도출하세요.

[종목 정보]
- 종목명: ${stock.name}
- 종목코드: ${stock.code}

[추출된 데이터]
${JSON.stringify(extractedData, null, 2)}

[분석 리포트 요약]
${report.substring(0, 2000)}

[추론 과정]
다음 단계를 따라 논리적으로 분석하세요:

1. **현재 상황 분석**: 현재가, 거래량, 수급 상황을 종합적으로 평가
2. **기술적 지표 해석**: 이동평균선 배열, 지지/저항선, 차트 패턴이 시사하는 바
3. **펀더멘털 평가**: NAV 괴리율, 운용자산, 수익률 트렌드가 의미하는 바
4. **수급 분석**: 투자자별 매매동향이 향후 가격에 미칠 영향
5. **리스크 요인**: 잠재적 하락 요인과 그 가능성
6. **상승 모멘텀**: 잠재적 상승 요인과 그 가능성
7. **종합 판단**: 위 분석을 종합한 최종 전망

[출력 형식]
아래 JSON 형식으로만 출력하세요:

{
  "shortTermOutlook": {
    "period": "1주일",
    "prediction": "상승/하락/횡보",
    "priceRange": {
      "low": "예상 저점",
      "high": "예상 고점"
    },
    "confidence": "높음/중간/낮음",
    "reasoning": "1-2문장의 근거"
  },
  "longTermOutlook": {
    "period": "1개월",
    "prediction": "상승/하락/횡보",
    "targetPrice": "목표가",
    "confidence": "높음/중간/낮음",
    "reasoning": "1-2문장의 근거"
  },
  "overallSentiment": "Bullish/Bearish/Neutral",
  "keyRisks": ["리스크1", "리스크2"],
  "keyCatalysts": ["모멘텀1", "모멘텀2"]
}`;
}

// ============================================
// OpenRouter API (Vision - Gemini 3.0 → 2.5 Fallback)
// ============================================

async function callOpenRouterVision(prompt, imageBase64) {
  const startIndex = currentOpenRouterModelIndex;

  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const modelIndex = (startIndex + i) % OPENROUTER_MODELS.length;
    const model = OPENROUTER_MODELS[modelIndex];

    console.log(`    → OpenRouter model: ${model}`);

    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/xxonbang/check_my_stocks",
          "X-Title": "Check My Stocks"
        },
        body: JSON.stringify({
          model: model,
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
          max_tokens: 8192,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status} - ${error}`);
      }

      const data = await response.json();
      currentOpenRouterModelIndex = modelIndex; // 성공한 모델 기억
      return data.choices[0].message.content;
    } catch (error) {
      console.log(`    ✗ ${model} failed: ${error.message}`);
      if (i === OPENROUTER_MODELS.length - 1) {
        throw new Error(`All OpenRouter models failed`);
      }
    }
  }
}

// ============================================
// OpenRouter API (Text - 리포트 생성용)
// ============================================

async function callOpenRouterText(prompt) {
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
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter Text API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// OpenRouter API (Reasoning - DeepSeek-R1)
// ============================================

async function callOpenRouterReasoning(prompt) {
  // 추론 모델 우선순위 (무료 모델)
  const reasoningModels = [
    "deepseek/deepseek-r1:free",
    "qwen/qwq-32b:free",
    "google/gemini-2.0-flash-exp:free"
  ];

  for (const model of reasoningModels) {
    try {
      console.log(`    → Reasoning model: ${model}`);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/xxonbang/check_my_stocks",
          "X-Title": "Check My Stocks"
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`${response.status} - ${error}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.log(`    ✗ ${model} failed: ${error.message}`);
    }
  }

  throw new Error("All reasoning models failed");
}

// ============================================
// Groq API (Vision - OCR용)
// ============================================

async function callGroqVision(prompt, imageBase64) {
  console.log("    → Groq Vision (llama-3.2-90b-vision-preview)");

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
      max_tokens: 8192,
      temperature: 0.1
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq Vision API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// Groq API (Text - 리포트 생성용, 초고속)
// ============================================

async function callGroqText(prompt) {
  console.log("    → Groq Text (llama-3.3-70b-versatile) - FAST");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Groq Text API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ============================================
// Gemini API (Vision - OCR용)
// ============================================

async function callGeminiVision(prompt, imageBase64) {
  console.log(`    → Gemini API (key #${currentGeminiKeyIndex + 1})`);

  for (let i = currentGeminiKeyIndex; i < GEMINI_API_KEYS.length; i++) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[i]);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
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
      currentGeminiKeyIndex = i;
      return response.text();
    } catch (error) {
      console.log(`    ✗ Gemini key #${i + 1} failed: ${error.message}`);
      if (i === GEMINI_API_KEYS.length - 1) {
        throw new Error("All Gemini API keys exhausted");
      }
    }
  }
}

// ============================================
// Gemini API (Text - 리포트 생성용)
// ============================================

async function callGeminiText(prompt) {
  console.log(`    → Gemini Text API (key #${currentGeminiKeyIndex + 1})`);

  for (let i = currentGeminiKeyIndex; i < GEMINI_API_KEYS.length; i++) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[i]);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      });

      const result = await model.generateContent(prompt);
      const response = await result.response;
      currentGeminiKeyIndex = i;
      return response.text();
    } catch (error) {
      console.log(`    ✗ Gemini key #${i + 1} failed: ${error.message}`);
      if (i === GEMINI_API_KEYS.length - 1) {
        throw new Error("All Gemini API keys exhausted");
      }
    }
  }
}

// ============================================
// Cloudflare Workers AI (Vision - OCR용)
// ============================================

async function callCloudflareVision(prompt, imageBase64) {
  console.log("    → Cloudflare Workers AI (Llama 3.2 Vision)");

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
        max_tokens: 8192
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
// Phase 1: OCR - Vision 모델로 데이터 추출
// ============================================

async function extractDataWithVision(prompt, imageBase64, stockName) {
  // 프로바이더 순서: OpenRouter → Groq → Gemini → Cloudflare
  const providerOrder = ["openrouter", "groq", "gemini", "cloudflare"];

  // 현재 작동 중인 프로바이더가 있으면 먼저 시도
  if (currentVisionProvider && visionProviders[currentVisionProvider].enabled && !visionProviders[currentVisionProvider].failed) {
    providerOrder.splice(providerOrder.indexOf(currentVisionProvider), 1);
    providerOrder.unshift(currentVisionProvider);
  }

  for (const providerKey of providerOrder) {
    const provider = visionProviders[providerKey];

    if (!provider.enabled || provider.failed) {
      continue;
    }

    try {
      console.log(`  [OCR] Trying ${provider.name}...`);
      let result;

      switch (providerKey) {
        case "openrouter":
          result = await callOpenRouterVision(prompt, imageBase64);
          break;
        case "groq":
          result = await callGroqVision(prompt, imageBase64);
          break;
        case "gemini":
          result = await callGeminiVision(prompt, imageBase64);
          break;
        case "cloudflare":
          result = await callCloudflareVision(prompt, imageBase64);
          break;
      }

      if (currentVisionProvider !== providerKey) {
        console.log(`  ✓ OCR: Switching to ${provider.name}`);
        currentVisionProvider = providerKey;
      }

      return result;

    } catch (error) {
      console.error(`  ✗ ${provider.name} failed: ${error.message}`);

      if (error.message.includes("429") || error.message.includes("503") || error.message.includes("exhausted")) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);
      }
    }
  }

  throw new Error(`[${stockName}] All vision providers failed for OCR`);
}

// ============================================
// Phase 2: 리포트 생성 - Groq 텍스트 모델 (초고속)
// ============================================

async function generateReportWithText(prompt, stockName) {
  // Groq 텍스트 모델 우선 (초고속)
  const providerOrder = ["groq", "openrouter", "gemini"];

  if (currentTextProvider && textProviders[currentTextProvider].enabled && !textProviders[currentTextProvider].failed) {
    providerOrder.splice(providerOrder.indexOf(currentTextProvider), 1);
    providerOrder.unshift(currentTextProvider);
  }

  for (const providerKey of providerOrder) {
    const provider = textProviders[providerKey];

    if (!provider.enabled || provider.failed) {
      continue;
    }

    try {
      console.log(`  [Report] Trying ${provider.name}...`);
      let result;

      switch (providerKey) {
        case "groq":
          result = await callGroqText(prompt);
          break;
        case "openrouter":
          result = await callOpenRouterText(prompt);
          break;
        case "gemini":
          result = await callGeminiText(prompt);
          break;
      }

      if (currentTextProvider !== providerKey) {
        console.log(`  ✓ Report: Switching to ${provider.name}`);
        currentTextProvider = providerKey;
      }

      return result;

    } catch (error) {
      console.error(`  ✗ ${provider.name} failed: ${error.message}`);

      if (error.message.includes("429") || error.message.includes("503") || error.message.includes("exhausted")) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);
      }
    }
  }

  throw new Error(`[${stockName}] All text providers failed for report generation`);
}

// ============================================
// Phase 3: 예측 생성 - 추론 모델 (DeepSeek-R1)
// ============================================

async function generatePredictionWithReasoning(prompt, stockName) {
  // OpenRouter 추론 모델 우선
  const providerOrder = ["openrouter_deepseek", "openrouter_qwen", "groq"];

  if (currentReasoningProvider && reasoningProviders[currentReasoningProvider].enabled && !reasoningProviders[currentReasoningProvider].failed) {
    providerOrder.splice(providerOrder.indexOf(currentReasoningProvider), 1);
    providerOrder.unshift(currentReasoningProvider);
  }

  for (const providerKey of providerOrder) {
    const provider = reasoningProviders[providerKey];

    if (!provider.enabled || provider.failed) {
      continue;
    }

    try {
      console.log(`  [Prediction] Trying ${provider.name}...`);
      let result;

      switch (providerKey) {
        case "openrouter_deepseek":
        case "openrouter_qwen":
          result = await callOpenRouterReasoning(prompt);
          break;
        case "groq":
          result = await callGroqText(prompt);
          break;
      }

      if (currentReasoningProvider !== providerKey) {
        console.log(`  ✓ Prediction: Switching to ${provider.name}`);
        currentReasoningProvider = providerKey;
      }

      return result;

    } catch (error) {
      console.error(`  ✗ ${provider.name} failed: ${error.message}`);

      if (error.message.includes("429") || error.message.includes("503") || error.message.includes("exhausted")) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);
      }
    }
  }

  // 예측 실패 시 기본값 반환 (필수가 아니므로)
  console.log(`  ⚠ [${stockName}] Prediction failed, using default`);
  return null;
}

// ============================================
// 3단계 종목 분석 (OCR → Report → Prediction)
// ============================================

async function analyzeSingleStock(stock) {
  const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

  if (!fs.existsSync(imagePath)) {
    console.log(`[${stock.name}] Screenshot not found, skipping...`);
    return null;
  }

  const imageBase64 = loadImageAsBase64(imagePath);
  console.log(`\n[${stock.name}] Starting 3-phase analysis...`);

  try {
    // ========== Phase 1: OCR (Vision) ==========
    console.log(`[${stock.name}] Phase 1: OCR (Data Extraction)`);
    const ocrPrompt = buildOCRPrompt(stock);
    const ocrResult = await extractDataWithVision(ocrPrompt, imageBase64, stock.name);
    const extractedData = parseJsonResponse(ocrResult, `${stock.name} OCR`);

    if (!extractedData) {
      console.error(`[${stock.name}] OCR failed to extract data`);
      return null;
    }

    console.log(`[${stock.name}] OCR Done - Price: ${extractedData.currentPrice}`);

    // 데이터 검증
    const warnings = validateExtractedData(extractedData, stock.name);

    // 짧은 대기 (rate limit 방지)
    await new Promise((resolve) => setTimeout(resolve, 500));

    // ========== Phase 2: Report Generation (Text - Groq 초고속) ==========
    console.log(`[${stock.name}] Phase 2: Report Generation (Groq Fast)`);
    const reportPrompt = buildReportPrompt(stock, extractedData);
    const report = await generateReportWithText(reportPrompt, stock.name);

    console.log(`[${stock.name}] Report Done`);

    // 짧은 대기
    await new Promise((resolve) => setTimeout(resolve, 500));

    // ========== Phase 3: Prediction (Reasoning - DeepSeek-R1) ==========
    console.log(`[${stock.name}] Phase 3: Prediction (Reasoning Model)`);
    const predictionPrompt = buildPredictionPrompt(stock, extractedData, report);
    const predictionResult = await generatePredictionWithReasoning(predictionPrompt, stock.name);
    const prediction = predictionResult ? parseJsonResponse(predictionResult, `${stock.name} Prediction`) : null;

    console.log(`[${stock.name}] Prediction Done`);

    // 결과 조합
    const result = {
      code: stock.code,
      name: stock.name,
      extracted_data: extractedData,
      ai_report: report,
      prediction: prediction?.overallSentiment || "Neutral",
      outlook: prediction || {
        shortTermOutlook: { prediction: "N/A", reasoning: "예측 모델 응답 없음" },
        longTermOutlook: { prediction: "N/A", reasoning: "예측 모델 응답 없음" },
        overallSentiment: "Neutral",
        keyRisks: [],
        keyCatalysts: []
      }
    };

    if (warnings.length > 0) {
      result.dataValidationWarnings = warnings;
    }

    console.log(`[${stock.name}] ✓ All phases complete\n`);
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
  console.log(`\nAnalyzing ${stocks.length} stocks with 3-phase pipeline...`);
  console.log("Pipeline: OCR (Vision) → Report (Groq Fast) → Prediction (Reasoning)\n");

  const results = [];

  for (const stock of stocks) {
    const result = await analyzeSingleStock(stock);
    if (result) {
      results.push(result);
    }
    // API 호출 간 대기 (rate limit 방지)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return { stocks: results };
}

// ============================================
// 메인 함수
// ============================================

async function main() {
  console.log("\n=== Stock Analyzer Started (3-Phase Pipeline) ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("Phase 1 (OCR): OpenRouter → Groq → Gemini → Cloudflare");
  console.log("Phase 2 (Report): Groq (Fast) → OpenRouter → Gemini");
  console.log("Phase 3 (Prediction): DeepSeek-R1 → Qwen QwQ → Groq\n");

  const stocks = loadStocks();
  console.log(`Loaded ${stocks.length} stocks`);

  try {
    const analysisResult = await analyzeStocks(stocks);

    const finalResult = {
      lastUpdated: new Date().toISOString(),
      pipeline: {
        ocr: currentVisionProvider ? visionProviders[currentVisionProvider]?.name : "None",
        report: currentTextProvider ? textProviders[currentTextProvider]?.name : "None",
        prediction: currentReasoningProvider ? reasoningProviders[currentReasoningProvider]?.name : "None"
      },
      ...analysisResult,
    };

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(finalResult, null, 2));

    const publicDataPath = path.join(ROOT_DIR, "public", "data", "analysis_results.json");
    fs.writeFileSync(publicDataPath, JSON.stringify(finalResult, null, 2));

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Results saved to: ${RESULTS_PATH}`);
    console.log(`Analyzed ${finalResult.stocks?.length || 0} stocks`);
    console.log(`OCR Provider: ${finalResult.pipeline.ocr}`);
    console.log(`Report Provider: ${finalResult.pipeline.report}`);
    console.log(`Prediction Provider: ${finalResult.pipeline.prediction}`);
  } catch (error) {
    console.error("Analysis failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
