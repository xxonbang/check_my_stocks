import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Load .env.local for local development
dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });

const STOCKS_PATH = path.join(ROOT_DIR, "data", "stocks.json");
const SCREENSHOTS_DIR = path.join(ROOT_DIR, "public", "screenshots");
const RESULTS_PATH = path.join(ROOT_DIR, "data", "analysis_results.json");

// 특정 종목 분석 지원
const TARGET_STOCK_CODE = process.env.TARGET_STOCK_CODE || '';
const TARGET_STOCK_NAME = process.env.TARGET_STOCK_NAME || '';
const SINGLE_STOCK_MODE = !!TARGET_STOCK_CODE;

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
  groq: { name: "Groq (Llama 4 Scout)", enabled: !!GROQ_API_KEY, failed: false },
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
  cloudflare: { name: "Cloudflare (Llama Vision)", enabled: !!(CF_ACCOUNT_ID && CF_API_TOKEN), failed: false },
};

// 텍스트 생성 프로바이더 (리포트 작성용) - Gemini 우선
const textProviders = {
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
  groq: { name: "Groq (Llama 3.3)", enabled: !!GROQ_API_KEY, failed: false },
  openrouter: { name: "OpenRouter", enabled: !!OPENROUTER_API_KEY, failed: false },
};

// 추론 모델 프로바이더 (예측용) - Gemini 우선
const reasoningProviders = {
  gemini: { name: "Gemini API", enabled: GEMINI_API_KEYS.length > 0, failed: false },
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
// 지원종료 예정 모델 경고 및 Fallback 준비 상태 확인
// ============================================
const enabledVisionProviders = Object.entries(visionProviders).filter(([_, p]) => p.enabled);
const hasVisionFallback = enabledVisionProviders.length > 1;

console.log("\n=== Deprecation Warning ===");
console.log("⚠ OpenRouter's google/gemini-2.0-flash-exp:free is scheduled for deprecation on 2026-02-06");

if (visionProviders.openrouter.enabled && !hasVisionFallback) {
  console.warn("⚠ [CRITICAL] OpenRouter is the ONLY enabled Vision provider!");
  console.warn("  → After 2026-02-06, OCR will fail without backup providers.");
  console.warn("  → Recommend: Enable GROQ_API_KEY or GEMINI_API_KEY for fallback.");
} else if (hasVisionFallback) {
  const fallbackNames = enabledVisionProviders
    .filter(([key, _]) => key !== "openrouter")
    .map(([_, p]) => p.name);
  console.log(`✓ Fallback providers ready: ${fallbackNames.join(", ")}`);
} else {
  console.warn("⚠ No Vision providers enabled. OCR will fail.");
}

// ============================================
// 유틸리티 함수
// ============================================

function loadStocks() {
  // 특정 종목이 지정된 경우 해당 종목만 반환
  if (SINGLE_STOCK_MODE) {
    console.log(`[Single Stock Mode] Targeting: ${TARGET_STOCK_NAME || TARGET_STOCK_CODE} (${TARGET_STOCK_CODE})`);
    return [{ code: TARGET_STOCK_CODE, name: TARGET_STOCK_NAME || TARGET_STOCK_CODE }];
  }

  // 전체 종목 분석
  const data = fs.readFileSync(STOCKS_PATH, "utf-8");
  return JSON.parse(data).stocks;
}

function loadExistingResults() {
  try {
    if (fs.existsSync(RESULTS_PATH)) {
      const data = fs.readFileSync(RESULTS_PATH, "utf-8");
      return JSON.parse(data);
    }
  } catch (e) {
    console.warn("Could not load existing results:", e.message);
  }
  return { stocks: [] };
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

// 프로바이더 실패 여부 판단 (세션 내 비활성화 조건)
function shouldMarkProviderFailed(error) {
  const errorMsg = error.message.toLowerCase();
  return (
    // Rate Limit / 서비스 불가
    error.message.includes("429") ||
    error.message.includes("503") ||
    // 모델 지원종료 / 삭제 (404, 410)
    error.message.includes("404") ||
    error.message.includes("410") ||
    // 명시적 지원종료 메시지
    errorMsg.includes("deprecated") ||
    errorMsg.includes("discontinued") ||
    errorMsg.includes("not found") ||
    errorMsg.includes("does not exist") ||
    errorMsg.includes("no longer available") ||
    errorMsg.includes("has been removed") ||
    // 키 소진
    error.message.includes("exhausted")
  );
}

// 지원종료 관련 에러인지 확인
function isDeprecationError(error) {
  const errorMsg = error.message.toLowerCase();
  return (
    error.message.includes("404") ||
    error.message.includes("410") ||
    errorMsg.includes("deprecated") ||
    errorMsg.includes("discontinued") ||
    errorMsg.includes("no longer available") ||
    errorMsg.includes("has been removed")
  );
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
// 데이터 정규화 함수 (OCR 결과 형식 통일)
// ============================================

function normalizeNumericValue(value) {
  if (value === null || value === undefined || value === 'N/A' || value === '') {
    return value;
  }

  const str = String(value).trim();

  // 이미 한국식 단위가 포함된 경우 그대로 반환 (예: "5조 2,689억", "87,897백만")
  if (/[조억천백만]/.test(str)) {
    return str;
  }

  // 퍼센트 값은 그대로 반환
  if (str.includes('%')) {
    return str;
  }

  // 콤마 제거 후 숫자 파싱
  const cleanStr = str.replace(/,/g, '');
  const num = parseFloat(cleanStr);

  // 숫자로 변환 가능하면 숫자로, 아니면 원본 반환
  return isNaN(num) ? str : num;
}

function normalizeExtractedData(data) {
  if (!data) return data;

  // 정규화할 가격/수량 필드 목록
  const numericFields = [
    'currentPrice', 'prevClose', 'openPrice', 'highPrice', 'lowPrice',
    'volume', 'high52week', 'low52week', 'inav', 'nav'
  ];

  numericFields.forEach(field => {
    if (data[field] !== undefined) {
      data[field] = normalizeNumericValue(data[field]);
    }
  });

  // 투자자별 매매동향 정규화
  if (data.investorTrend) {
    ['individual', 'foreign', 'institution'].forEach(field => {
      if (data.investorTrend[field] !== undefined) {
        data.investorTrend[field] = normalizeNumericValue(data.investorTrend[field]);
      }
    });
  }

  // 차트분석 내 이동평균선 정규화
  if (data.chartAnalysis) {
    ['ma5', 'ma20', 'ma60', 'support', 'resistance'].forEach(field => {
      if (data.chartAnalysis[field] !== undefined) {
        data.chartAnalysis[field] = normalizeNumericValue(data.chartAnalysis[field]);
      }
    });
  }

  return data;
}

// ============================================
// 배치 프롬프트 (모든 종목을 단일 API 호출로 처리)
// ============================================

function buildBatchPrompt(stocks) {
  const stockList = stocks.map((s, i) => `  ${i + 1}. "${s.name}" (${s.code}) - 이미지 #${i + 1}`).join('\n');

  return `[Role] 당신은 금융 데이터 추출, 분석, 예측을 수행하는 전문 ETF/주식 분석가입니다.

[Task]
아래 ${stocks.length}개의 이미지는 각각 다른 종목의 네이버 증권 상세 페이지입니다.
**모든 종목에 대해** 데이터 추출, 분석 리포트 작성, 향후 전망 예측을 수행하세요.

[종목 목록과 이미지 매핑]
${stockList}

---

## 각 종목별 수행 작업

### 1. 데이터 추출 (extracted_data)
- 가격: currentPrice, priceChange, changePercent, prevClose, openPrice, highPrice, lowPrice
- 거래: volume, tradingValue
- 52주: high52week, low52week
- ETF 지표: inav, nav, premiumDiscount, marketCap, aum, expenseRatio, dividendYield
- 수익률: return1m, return3m, return1y
- 투자자별 매매동향: investorTrend (individual, foreign, institution)
- 차트분석: chartAnalysis (trend, maAlignment, signal, support, resistance, pattern)

### 2. 분석 리포트 (ai_report)
마크다운 형식으로 기술적 분석, 펀더멘털 분석, 수익률 분석, 수급 분석, 긍정적/부정적 요인 포함

### 3. 전망 예측 (outlook)
단기(1주일), 중기(1개월) 전망과 종합 심리(Bullish/Bearish/Neutral)

---

## 출력 형식 (JSON)

**반드시 아래 JSON 구조로만 출력하세요. 다른 텍스트 없이 JSON만 출력:**

{
  "results": [
    {
      "code": "종목코드1",
      "name": "종목명1",
      "extracted_data": {
        "currentPrice": 24840,
        "priceChange": 325,
        "changePercent": "+1.33%",
        "prevClose": 24515,
        "openPrice": 24825,
        "highPrice": 24935,
        "lowPrice": 24815,
        "volume": 3533527,
        "tradingValue": "거래대금",
        "high52week": 25390,
        "low52week": 15974,
        "inav": 24840,
        "nav": 24544,
        "premiumDiscount": "-0.12%",
        "marketCap": "시가총액",
        "aum": "운용자산",
        "expenseRatio": "0.0062%",
        "dividendYield": "연 0.63%",
        "return1m": "-0.37%",
        "return3m": "+1.74%",
        "return1y": "+17.96%",
        "investorTrend": { "individual": -14257, "foreign": 20700, "institution": -20217 },
        "chartAnalysis": { "trend": "상승", "maAlignment": "정배열", "signal": "매수", "support": 15974, "resistance": 25390, "pattern": "패턴명" }
      },
      "ai_report": "## 기술적 분석\\n...",
      "prediction": "Bullish",
      "outlook": {
        "shortTermOutlook": { "period": "1주일", "prediction": "상승", "priceRange": { "low": 24500, "high": 25500 }, "confidence": "중간", "reasoning": "근거" },
        "longTermOutlook": { "period": "1개월", "prediction": "상승", "targetPrice": 26000, "confidence": "중간", "reasoning": "근거" },
        "overallSentiment": "Bullish",
        "keyRisks": ["리스크1"],
        "keyCatalysts": ["모멘텀1"]
      }
    },
    {
      "code": "종목코드2",
      "name": "종목명2",
      ... (동일 구조)
    }
  ]
}

**중요: results 배열에 ${stocks.length}개 종목 모두 포함해야 합니다. 이미지 순서대로 종목을 매핑하세요.**`;
}

// ============================================
// 통합 프롬프트 (OCR + Report + Prediction 단일 호출) - 단일 종목용
// ============================================

function buildUnifiedPrompt(stock) {
  return `[Role] 당신은 금융 데이터 추출, 분석, 예측을 수행하는 전문 ETF/주식 분석가입니다.

[Task]
이 이미지는 "${stock.name}" (종목코드: ${stock.code})의 네이버 증권 상세 페이지입니다.
다음 3가지 작업을 **한 번에** 수행하세요:
1. 이미지에서 데이터 추출 (OCR)
2. 추출된 데이터 기반 분석 리포트 작성
3. 향후 전망 예측

---

## Part 1: 데이터 추출 (extracted_data)

**테이블 데이터 추출 시 주의사항:**
1. 레이블-값 매핑: "전일" → prevClose, "시가" → openPrice, "고가" → highPrice, "저가" → lowPrice
2. 숫자를 정확히 읽고, 저가 ≤ 현재가 ≤ 고가 검증

**추출할 데이터:**
- 가격: currentPrice, priceChange, changePercent, prevClose, openPrice, highPrice, lowPrice
- 거래: volume, tradingValue
- 52주: high52week, low52week
- ETF 지표: inav, nav, premiumDiscount, marketCap, aum, expenseRatio, dividendYield
- 수익률: return1m, return3m, return1y
- 투자자별 매매동향: investorTrend (individual, foreign, institution)

**차트 시각적 분석 (chartAnalysis):**
- trend: 상승/하락/횡보
- maAlignment: 정배열/역배열/수렴
- signal: 매수/매도/관망
- support, resistance, pattern

---

## Part 2: 분석 리포트 (ai_report)

추출된 데이터를 바탕으로 마크다운 형식의 종합 분석 리포트를 작성하세요.

**포함할 내용:**
- 기술적 분석 (차트 패턴, 이동평균선, 지지/저항선)
- 펀더멘털 분석 (NAV, 괴리율, 운용자산)
- 수익률 분석 (1개월/3개월/1년 트렌드)
- 수급 분석 (투자자별 매매동향)
- 긍정적/부정적 요인
- 투자 시 유의사항

---

## Part 3: 전망 예측 (outlook)

추출된 데이터와 분석을 바탕으로 향후 전망을 예측하세요.

**예측할 내용:**
- 단기 전망 (1주일): 상승/하락/횡보, 예상 가격 범위
- 중기 전망 (1개월): 상승/하락/횡보, 목표가
- 종합 심리: Bullish/Bearish/Neutral
- 주요 리스크 및 모멘텀

---

## 출력 형식 (JSON)

**반드시 아래 JSON 구조로만 출력하세요. 다른 텍스트 없이 JSON만 출력:**

{
  "extracted_data": {
    "currentPrice": 24840,
    "priceChange": 325,
    "changePercent": "+1.33%",
    "prevClose": 24515,
    "openPrice": 24825,
    "highPrice": 24935,
    "lowPrice": 24815,
    "volume": 3533527,
    "tradingValue": "거래대금 (단위 포함)",
    "high52week": 25390,
    "low52week": 15974,
    "inav": 24840,
    "nav": 24544,
    "premiumDiscount": "-0.12%",
    "marketCap": "시가총액 (단위 포함)",
    "aum": "운용자산 (단위 포함)",
    "expenseRatio": "0.0062%",
    "dividendYield": "연 0.63%",
    "return1m": "-0.37%",
    "return3m": "+1.74%",
    "return1y": "+17.96%",
    "investorTrend": {
      "individual": -14257,
      "foreign": 20700,
      "institution": -20217
    },
    "chartAnalysis": {
      "trend": "상승/하락/횡보",
      "ma5": 24750,
      "ma20": 24550,
      "ma60": 24050,
      "support": 15974,
      "resistance": 25390,
      "pattern": "차트 패턴명",
      "maAlignment": "정배열/역배열/수렴",
      "signal": "매수/매도/관망"
    }
  },
  "ai_report": "## 기술적 분석\\n...마크다운 형식 리포트 전체...",
  "prediction": "Bullish/Bearish/Neutral",
  "outlook": {
    "shortTermOutlook": {
      "period": "1주일",
      "prediction": "상승/하락/횡보",
      "priceRange": { "low": 24500, "high": 25500 },
      "confidence": "높음/중간/낮음",
      "reasoning": "근거 설명"
    },
    "longTermOutlook": {
      "period": "1개월",
      "prediction": "상승/하락/횡보",
      "targetPrice": 26000,
      "confidence": "높음/중간/낮음",
      "reasoning": "근거 설명"
    },
    "overallSentiment": "Bullish/Bearish/Neutral",
    "keyRisks": ["리스크1", "리스크2"],
    "keyCatalysts": ["모멘텀1", "모멘텀2"]
  }
}`;
}

// ============================================
// [DEPRECATED] 개별 프롬프트 함수들 - 호환성 유지용
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
  // 추론 모델 우선순위 (2026.01 기준 무료 모델)
  const reasoningModels = [
    "tngtech/deepseek-r1t2-chimera:free",  // DeepSeek R1T2 Chimera (무료, 추론 특화)
    "tngtech/deepseek-r1t-chimera:free",   // DeepSeek R1T Chimera (무료, 백업)
    "google/gemini-2.0-flash-exp:free"     // Gemini 2.0 Flash (무료, 최후 백업)
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
// Groq API (Vision - OCR용, Llama 4 Scout)
// ============================================

async function callGroqVision(prompt, imageBase64) {
  // Llama 4 Scout: 17B active params, 460 tokens/s, 128K context
  // Note: llama-3.2-90b-vision-preview was decommissioned in 2026
  console.log("    → Groq Vision (Llama 4 Scout)");

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
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
// Gemini API (Vision - OCR용, 단일 이미지)
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
// Gemini API (Vision - 배치, 다중 이미지)
// ============================================

async function callGeminiVisionBatch(prompt, stockImages) {
  console.log(`    → Gemini API Batch (${stockImages.length} images, key #${currentGeminiKeyIndex + 1})`);

  for (let i = currentGeminiKeyIndex; i < GEMINI_API_KEYS.length; i++) {
    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEYS[i]);
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 65536, // 배치 처리를 위해 토큰 증가
        },
      });

      // 프롬프트와 모든 이미지를 하나의 콘텐츠 배열로 구성
      const contentParts = [prompt];

      for (const { code, imageBase64 } of stockImages) {
        contentParts.push({
          inlineData: {
            mimeType: "image/png",
            data: imageBase64,
          },
        });
      }

      const result = await model.generateContent(contentParts);
      const response = await result.response;
      currentGeminiKeyIndex = i;
      currentVisionProvider = "gemini"; // 배치 호출 시 프로바이더 설정
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
  // 프로바이더 순서: Gemini (차트 분석 품질) → OpenRouter → Groq → Cloudflare
  // Gemini가 차트 기술적 분석에 가장 뛰어남
  const providerOrder = ["gemini", "openrouter", "groq", "cloudflare"];

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

      if (shouldMarkProviderFailed(error)) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);

        if (isDeprecationError(error)) {
          console.warn(`  ⚠ [DEPRECATION WARNING] ${provider.name} model may be deprecated or removed.`);
          console.warn(`    → Automatic fallback to other providers activated.`);
        }
      }
    }
  }

  throw new Error(`[${stockName}] All vision providers failed for OCR`);
}

// ============================================
// Phase 2: 리포트 생성 - Gemini 우선 (고품질)
// ============================================

async function generateReportWithText(prompt, stockName) {
  // Gemini 텍스트 모델 우선 (고품질)
  const providerOrder = ["gemini", "groq", "openrouter"];

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

      if (shouldMarkProviderFailed(error)) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);

        if (isDeprecationError(error)) {
          console.warn(`  ⚠ [DEPRECATION WARNING] ${provider.name} model may be deprecated or removed.`);
        }
      }
    }
  }

  throw new Error(`[${stockName}] All text providers failed for report generation`);
}

// ============================================
// Phase 3: 예측 생성 - Gemini 우선 (고품질)
// ============================================

async function generatePredictionWithReasoning(prompt, stockName) {
  // Gemini 우선 (고품질), DeepSeek-R1/Groq은 fallback
  const providerOrder = ["gemini", "openrouter_deepseek", "openrouter_qwen", "groq"];

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
        case "gemini":
          result = await callGeminiText(prompt);
          break;
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

      if (shouldMarkProviderFailed(error)) {
        provider.failed = true;
        console.log(`  ⚠ ${provider.name} marked as failed for this session`);

        if (isDeprecationError(error)) {
          console.warn(`  ⚠ [DEPRECATION WARNING] ${provider.name} model may be deprecated or removed.`);
        }
      }
    }
  }

  // 예측 실패 시 기본값 반환 (필수가 아니므로)
  console.log(`  ⚠ [${stockName}] Prediction failed, using default`);
  return null;
}

// ============================================
// 단일 API 호출 종목 분석 (통합 프롬프트)
// ============================================

async function analyzeSingleStock(stock) {
  const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

  if (!fs.existsSync(imagePath)) {
    console.log(`[${stock.name}] Screenshot not found, skipping...`);
    return null;
  }

  const imageBase64 = loadImageAsBase64(imagePath);
  console.log(`\n[${stock.name}] Starting unified analysis (single API call)...`);

  try {
    // ========== 통합 분석 (단일 API 호출) ==========
    console.log(`[${stock.name}] Unified Analysis: OCR + Report + Prediction`);
    const unifiedPrompt = buildUnifiedPrompt(stock);
    const unifiedResult = await extractDataWithVision(unifiedPrompt, imageBase64, stock.name);
    const parsedResult = parseJsonResponse(unifiedResult, `${stock.name} Unified`);

    if (!parsedResult) {
      console.error(`[${stock.name}] Unified analysis failed to parse response`);
      return null;
    }

    // 통합 응답에서 각 부분 추출
    const rawExtractedData = parsedResult.extracted_data;
    const aiReport = parsedResult.ai_report;
    const prediction = parsedResult.prediction;
    const outlook = parsedResult.outlook;

    if (!rawExtractedData) {
      console.error(`[${stock.name}] No extracted_data in response`);
      return null;
    }

    // 데이터 형식 정규화 (문자열 → 숫자 변환)
    const extractedData = normalizeExtractedData(rawExtractedData);
    console.log(`[${stock.name}] Data extracted - Price: ${extractedData.currentPrice}`);

    // 데이터 검증
    const warnings = validateExtractedData(extractedData, stock.name);

    // 사용된 프로바이더 정보
    const providerName = currentVisionProvider ? visionProviders[currentVisionProvider]?.name : "Unknown";

    // 결과 조합
    const result = {
      code: stock.code,
      name: stock.name,
      extracted_data: extractedData,
      ai_report: aiReport || "분석 리포트를 생성하지 못했습니다.",
      prediction: prediction || outlook?.overallSentiment || "Neutral",
      outlook: outlook || {
        shortTermOutlook: { prediction: "N/A", reasoning: "예측 데이터 없음" },
        longTermOutlook: { prediction: "N/A", reasoning: "예측 데이터 없음" },
        overallSentiment: "Neutral",
        keyRisks: [],
        keyCatalysts: []
      },
      pipeline: {
        ocr: providerName,
        report: providerName,
        prediction: providerName
      }
    };

    if (warnings.length > 0) {
      result.dataValidationWarnings = warnings;
    }

    console.log(`[${stock.name}] ✓ Unified analysis complete (1 API call)\n`);
    return result;

  } catch (error) {
    console.error(`[${stock.name}] Analysis failed: ${error.message}`);
    return null;
  }
}

// ============================================
// 전체 종목 배치 분석 (단일 API 호출)
// ============================================

async function analyzeStocks(stocks) {
  console.log(`\nAnalyzing ${stocks.length} stocks with BATCH mode...`);
  console.log("Mode: ALL stocks in SINGLE API call\n");

  // 1. 모든 종목의 이미지 로드
  const stockImages = [];
  const validStocks = [];

  for (const stock of stocks) {
    const imagePath = path.join(SCREENSHOTS_DIR, `${stock.code}.png`);

    if (!fs.existsSync(imagePath)) {
      console.log(`[${stock.name}] Screenshot not found, skipping...`);
      continue;
    }

    const imageBase64 = loadImageAsBase64(imagePath);
    stockImages.push({ code: stock.code, imageBase64 });
    validStocks.push(stock);
    console.log(`[${stock.name}] Image loaded (${stock.code})`);
  }

  if (stockImages.length === 0) {
    console.error("No valid stock images found!");
    return { stocks: [] };
  }

  console.log(`\nLoaded ${stockImages.length} images, starting batch analysis...`);

  try {
    // 2. 배치 프롬프트 생성
    const batchPrompt = buildBatchPrompt(validStocks);

    // 3. 단일 API 호출 (모든 이미지 포함)
    console.log(`\n[BATCH] Calling Gemini API with ${stockImages.length} images...`);
    const batchResult = await callGeminiVisionBatch(batchPrompt, stockImages);

    // 4. 응답 파싱
    const parsedResult = parseJsonResponse(batchResult, "Batch Analysis");

    if (!parsedResult || !parsedResult.results) {
      console.error("Batch analysis failed to parse response");
      console.log("Raw response:", batchResult?.substring(0, 500));
      return { stocks: [] };
    }

    console.log(`\n[BATCH] Received ${parsedResult.results.length} stock results`);

    // 5. 각 종목 결과 처리
    const results = [];
    const providerName = currentVisionProvider ? visionProviders[currentVisionProvider]?.name : "Gemini API";

    for (const stockResult of parsedResult.results) {
      const stock = validStocks.find(s => s.code === stockResult.code);
      if (!stock) {
        console.warn(`Unknown stock code in response: ${stockResult.code}`);
        continue;
      }

      // 데이터 정규화
      const extractedData = normalizeExtractedData(stockResult.extracted_data);

      // 데이터 검증
      const warnings = validateExtractedData(extractedData, stock.name);

      const result = {
        code: stockResult.code,
        name: stockResult.name || stock.name,
        extracted_data: extractedData,
        ai_report: stockResult.ai_report || "분석 리포트를 생성하지 못했습니다.",
        prediction: stockResult.prediction || stockResult.outlook?.overallSentiment || "Neutral",
        outlook: stockResult.outlook || {
          shortTermOutlook: { prediction: "N/A", reasoning: "예측 데이터 없음" },
          longTermOutlook: { prediction: "N/A", reasoning: "예측 데이터 없음" },
          overallSentiment: "Neutral",
          keyRisks: [],
          keyCatalysts: []
        },
        pipeline: {
          ocr: providerName,
          report: providerName,
          prediction: providerName
        }
      };

      if (warnings.length > 0) {
        result.dataValidationWarnings = warnings;
      }

      results.push(result);
      console.log(`[${stock.name}] ✓ Processed - Price: ${extractedData?.currentPrice || 'N/A'}`);
    }

    console.log(`\n[BATCH] ✓ Complete! ${results.length}/${stockImages.length} stocks processed with 1 API call\n`);
    return { stocks: results };

  } catch (error) {
    console.error(`[BATCH] Analysis failed: ${error.message}`);

    // 배치 실패 시 개별 처리로 폴백
    console.log("\n[FALLBACK] Trying individual analysis...");
    const results = [];

    for (const stock of validStocks) {
      const result = await analyzeSingleStock(stock);
      if (result) {
        results.push(result);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return { stocks: results };
  }
}

// ============================================
// 메인 함수
// ============================================

async function main() {
  console.log("\n=== Stock Analyzer Started (BATCH Mode) ===");
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Mode: ${SINGLE_STOCK_MODE ? 'Single Stock (1 API call)' : 'Batch (ALL stocks in 1 API call)'}`);
  console.log("API Calls: 1 TOTAL (regardless of stock count)");
  console.log("Provider: Gemini API (multi-image batch)\n");

  const stocks = loadStocks();
  console.log(`Loaded ${stocks.length} stocks`);

  try {
    const analysisResult = await analyzeStocks(stocks);

    const pipelineInfo = {
      ocr: currentVisionProvider ? visionProviders[currentVisionProvider]?.name : "None",
      report: currentTextProvider ? textProviders[currentTextProvider]?.name : "None",
      prediction: currentReasoningProvider ? reasoningProviders[currentReasoningProvider]?.name : "None"
    };

    let finalResult;

    if (SINGLE_STOCK_MODE) {
      // 단일 종목 모드: 기존 결과에 병합
      const existingResults = loadExistingResults();
      const existingStocks = existingResults.stocks || [];

      // 새 분석 결과의 종목
      const newStock = analysisResult.stocks?.[0];

      if (newStock) {
        // 기존 종목 중 같은 코드가 있으면 업데이트, 없으면 추가
        const stockIndex = existingStocks.findIndex(s => s.code === newStock.code);
        if (stockIndex >= 0) {
          existingStocks[stockIndex] = newStock;
          console.log(`Updated existing stock: ${newStock.name} (${newStock.code})`);
        } else {
          existingStocks.push(newStock);
          console.log(`Added new stock: ${newStock.name} (${newStock.code})`);
        }
      }

      finalResult = {
        lastUpdated: new Date().toISOString(),
        pipeline: pipelineInfo,
        stocks: existingStocks,
      };
    } else {
      // 전체 종목 모드: 기존 결과 덮어쓰기
      finalResult = {
        lastUpdated: new Date().toISOString(),
        pipeline: pipelineInfo,
        ...analysisResult,
      };
    }

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(finalResult, null, 2));

    const publicDataPath = path.join(ROOT_DIR, "public", "data", "analysis_results.json");
    fs.writeFileSync(publicDataPath, JSON.stringify(finalResult, null, 2));

    console.log(`\n=== Analysis Complete ===`);
    console.log(`Results saved to: ${RESULTS_PATH}`);
    console.log(`Total stocks in results: ${finalResult.stocks?.length || 0}`);
    console.log(`OCR Provider: ${finalResult.pipeline.ocr}`);
    console.log(`Report Provider: ${finalResult.pipeline.report}`);
    console.log(`Prediction Provider: ${finalResult.pipeline.prediction}`);
  } catch (error) {
    console.error("Analysis failed:", error.message);
    process.exit(1);
  }
}

main().catch(console.error);
