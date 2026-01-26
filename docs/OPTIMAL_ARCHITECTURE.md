# 최적의 데이터 수집 아키텍처 설계

> **목표**: 3개 접근법의 장점만 결합한 최고의 구성
> **기준**: 안정성, 정확도, 비용 효율성, 유지보수성, 법적 준수

---

## 1. Executive Summary

### 최적 구성 한눈에 보기

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPTIMAL ARCHITECTURE                          │
│                   "Best of All Worlds" Design                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Layer 1: Data Collection                  │   │
│  │  ┌───────────────────┐    ┌───────────────────┐             │   │
│  │  │   Korean Stocks   │    │    US Stocks      │             │   │
│  │  │  ─────────────────│    │  ─────────────────│             │   │
│  │  │  1. 공공데이터포털  │    │  1. Finnhub API   │             │   │
│  │  │  2. 한국투자증권API │    │  2. Yahoo Finance │             │   │
│  │  │  3. KRX DataMarket│    │  3. Twelve Data   │             │   │
│  │  └───────────────────┘    └───────────────────┘             │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 Layer 2: Validation Engine                   │   │
│  │  • Dual-Source Cross Verification                           │   │
│  │  • Confidence Scoring (98% → 65%)                           │   │
│  │  • Circuit Breaker Pattern                                   │   │
│  │  • Automatic Fallback Trigger                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Layer 3: AI Fallback (Emergency Only)           │   │
│  │  • Gemini 2.5 Flash Screenshot OCR (95%+ accuracy)          │   │
│  │  • Multi-Provider Gateway (Gemini → Groq → Claude)          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │               Layer 4: AI Analysis Pipeline                  │   │
│  │  • Phase 1: Data Enrichment (Gemini 2.5 Flash)              │   │
│  │  • Phase 2: Report Generation (Gemini 2.5 Flash)            │   │
│  │  • Phase 3: Prediction (Gemini 3 Pro)                       │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                  Layer 5: Output & Storage                   │   │
│  │  • JSON Results → GitHub Repository                         │   │
│  │  • GitHub Pages Static Hosting                              │   │
│  │  • React Dashboard                                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1: 데이터 수집 (최적 구성)

### 2.1 한국 주식 데이터

| 우선순위 | 소스 | 용도 | 장점 | 채택 이유 |
|----------|------|------|------|----------|
| **1순위** | 공공데이터포털 | 시세, 종목정보 | 무료, 정부 공인, 법적 안전 | 접근법 2, 3에서 검증됨 |
| **2순위** | 한국투자증권 OpenAPI | 실시간 시세, 매매 | REST API, 공식 지원 | 2026년 최신 연구 |
| **3순위** | KRX 데이터마켓플레이스 | 수급, 공매도 | 거래소 공식 데이터 | 접근법 2에서 활용 |
| **4순위** | FinanceDataReader | 보조 데이터 | 다양한 소스 통합 | 접근법 3에서 활용 |

```python
# 최적 한국 주식 데이터 수집 코드 구조
class KoreanStockCollector:
    def __init__(self):
        self.sources = [
            PublicDataPortalAPI(),    # 1순위: 공공데이터포털
            KISOpenAPI(),              # 2순위: 한국투자증권
            KRXDataMarket(),           # 3순위: KRX
            FinanceDataReader(),       # 4순위: 보조
        ]

    async def collect(self, stock_code: str) -> ValidatedData:
        results = []
        for source in self.sources:
            try:
                data = await source.fetch(stock_code)
                results.append(data)
                if len(results) >= 2:  # Dual-Source 확보
                    break
            except Exception as e:
                continue

        return self.validation_engine.validate(results)
```

### 2.2 미국 주식 데이터

| 우선순위 | 소스 | Rate Limit | 비용 | 채택 이유 |
|----------|------|------------|------|----------|
| **1순위** | Finnhub API | 60/min | 무료 플랜 | 높은 신뢰성, 공식 API |
| **2순위** | Yahoo Finance API | ~100/min | 무료 | 포괄적 데이터 |
| **3순위** | Twelve Data | 8/min (무료) | 유료 플랜 | 기술 지표 풍부 |

### 2.3 절대 사용하지 말 것

| 소스 | 제외 이유 |
|------|----------|
| **pykrx** | IP 차단 위험, 해제 불가능 (접근법 3 연구 결과) |
| **네이버 금융 크롤링** | 법적 위험, 2024년 판결 선례 |
| **yfinance (주요 소스로)** | 불안정, 빈번한 429 오류 |

---

## 3. Layer 2: 검증 엔진 (핵심 혁신)

### 3.1 Dual-Source 검증 시스템 (접근법 3에서 채택)

```
┌─────────────────────────────────────────────────────────────────┐
│                    Validation Engine Architecture                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Source A (Primary)              Source B (Secondary)           │
│  ┌─────────────────┐            ┌─────────────────┐            │
│  │ 공공데이터포털   │            │ 한국투자증권 API │            │
│  │ or Finnhub     │            │ or Yahoo Finance│            │
│  └────────┬────────┘            └────────┬────────┘            │
│           │                              │                      │
│           └──────────┬───────────────────┘                      │
│                      ↓                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 Cross Validation                         │   │
│  │                                                          │   │
│  │  compare(A, B) → {                                       │   │
│  │    price_diff: |A.price - B.price| / A.price,           │   │
│  │    volume_diff: |A.volume - B.volume| / A.volume,       │   │
│  │    fields_match: count(matching_fields) / total_fields  │   │
│  │  }                                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                      ↓                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Confidence Score Calculation                │   │
│  │                                                          │   │
│  │  if price_diff < 0.1% && fields_match > 95%:            │   │
│  │      confidence = 98% (MATCH)                           │   │
│  │  elif price_diff < 1% && fields_match > 80%:            │   │
│  │      confidence = 85% (PARTIAL)                         │   │
│  │  elif price_diff < 5%:                                  │   │
│  │      confidence = 70% (CONFLICT → Manual Review)        │   │
│  │  else:                                                   │   │
│  │      confidence = 65% (SINGLE → Trigger Fallback)       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Circuit Breaker 패턴 (접근법 2, 3 통합)

```javascript
// Circuit Breaker 최적 설정
const CircuitBreakerConfig = {
  // 상태 전이 조건
  failureThreshold: 5,      // 5회 연속 실패 → OPEN
  successThreshold: 3,      // 3회 연속 성공 → CLOSED
  halfOpenTimeout: 30000,   // 30초 후 HALF_OPEN 시도

  // 재시도 전략 (지수 백오프)
  retryDelays: [1000, 2000, 4000, 8000, 16000],
  maxRetries: 5,

  // Rate Limit 대응
  rateLimitBackoff: {
    '429': 60000,   // 1분 대기
    '503': 30000,   // 30초 대기
  },

  // Provider별 설정
  providers: {
    'public-data-portal': { timeout: 10000, priority: 1 },
    'kis-api': { timeout: 5000, priority: 2 },
    'finnhub': { timeout: 5000, priority: 1 },
  }
};
```

### 3.3 자동 Fallback 트리거

```
Tier 1: Primary APIs (신뢰도 98%)
    ↓ 2개 소스 모두 실패 시
Tier 2: Secondary APIs (신뢰도 85%)
    ↓ 2개 소스 모두 실패 시
Tier 3: Cached Data (신뢰도 70%, 신선도 표시)
    ↓ 캐시 없거나 만료 시
Tier 4: Gemini Vision OCR (신뢰도 65%, 검증 필요)
    ↓ OCR 실패 시
Tier 5: Graceful Degradation (에러 메시지, 마지막 성공 데이터)
```

---

## 4. Layer 3: AI Fallback (응급 전용)

### 4.1 Multi-Provider AI Gateway (접근법 1에서 채택, 개선)

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Gateway Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   AI Gateway (Bifrost)                   │   │
│  │  • 11μs 오버헤드                                         │   │
│  │  • Multi-provider 라우팅                                 │   │
│  │  • 자동 Fallback                                         │   │
│  │  • 시맨틱 캐싱                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │  Gemini   │  │   Groq    │  │  Claude   │  │ OpenRouter│   │
│  │  2.5Flash │  │Llama4Scout│  │ Opus 4.5  │  │ (Backup)  │   │
│  │  ────────  │  │  ────────  │  │  ────────  │  │  ────────  │   │
│  │  95%+ 정확 │  │  460tok/s │  │  최저환각  │  │  무료모델  │   │
│  │  $0.10/1M │  │  $0.11/1M │  │  고비용   │  │  Rate제한 │   │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘   │
│                                                                 │
│  Provider Selection Logic:                                      │
│  1. Gemini 2.5 Flash (Primary - Best accuracy/cost)            │
│  2. Groq Llama 4 Scout (Fast fallback)                         │
│  3. Claude Opus 4.5 (Critical data - lowest hallucination)     │
│  4. OpenRouter Free (Budget fallback, rate-limited)            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Screenshot OCR 최적 설정 (접근법 1 + 개선)

```javascript
// Playwright 최적 설정 (접근법 1에서 채택)
const playwrightConfig = {
  viewport: { width: 1920, height: 2000 },
  deviceScaleFactor: 2,  // 고해상도 (OCR 정확도 향상)
  locale: 'ko-KR',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...',

  // 개선: TLS Fingerprint 위장 (접근법 3에서 채택)
  // curl_cffi 사용 권장 (HTTP 요청 시)
};

// OCR 프롬프트 최적화 (접근법 1에서 채택)
const ocrPrompt = `
[Role] 금융 데이터 추출 전문가

[Task] 스크린샷에서 다음 데이터를 정확히 추출:

[Part 1: 숫자 데이터]
- 현재가, 전일, 시가, 고가, 저가
- 거래량, 거래대금
- 52주 최고/최저
- NAV, iNAV, 괴리율 (ETF)

[Part 2: 차트 분석]
- 추세: 상승/하락/횡보
- 이동평균선 배열: 정배열/역배열/수렴
- 신호: 매수/매도/관망

[검증 규칙]
- 저가 ≤ 현재가 ≤ 고가
- 저가 ≤ 시가 ≤ 고가

JSON 형식으로만 출력.
`;
```

### 4.3 OCR 결과 후처리 검증 (신규 추가)

```javascript
// OCR 결과 자동 검증 (접근법 3의 Validation Engine 적용)
function validateOCRResult(ocrData, stockCode) {
  const warnings = [];

  // 가격 논리 검증
  if (ocrData.lowPrice > ocrData.highPrice) {
    warnings.push('LOW > HIGH: Data error');
  }
  if (ocrData.currentPrice < ocrData.lowPrice ||
      ocrData.currentPrice > ocrData.highPrice) {
    warnings.push('Current price out of range');
  }

  // 이전 캐시와 비교 (급격한 변동 감지)
  const cached = getCache(stockCode);
  if (cached) {
    const priceDiff = Math.abs(ocrData.currentPrice - cached.currentPrice)
                      / cached.currentPrice;
    if (priceDiff > 0.15) {  // 15% 이상 변동
      warnings.push(`Unusual price change: ${(priceDiff*100).toFixed(1)}%`);
    }
  }

  return {
    data: ocrData,
    confidence: warnings.length === 0 ? 0.95 : 0.70,
    warnings,
    requiresReview: warnings.length > 0
  };
}
```

---

## 5. Layer 4: AI 분석 파이프라인 (접근법 1 최적화)

### 5.1 3단계 파이프라인 (검증 단계 추가)

```
┌─────────────────────────────────────────────────────────────────┐
│              Optimized 3-Phase AI Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: Data Preparation & Enrichment                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Input: Validated Data (from Layer 2)                    │   │
│  │  Model: Gemini 2.5 Flash                                 │   │
│  │  Task:                                                   │   │
│  │    - 기술 지표 해석 (RSI, MACD, 이동평균)                 │   │
│  │    - 패턴 식별 (이중바닥, 상승삼각형 등)                   │   │
│  │    - 수급 분석 (외국인/기관 동향)                         │   │
│  │  Output: Enriched Analysis Data                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  Phase 2: Report Generation                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Input: Enriched Data                                    │   │
│  │  Model: Gemini 2.5 Flash                                 │   │
│  │  Task:                                                   │   │
│  │    - 기술적 분석 리포트                                   │   │
│  │    - 펀더멘털 분석 (NAV, 괴리율, 총보수)                  │   │
│  │    - 수익률 분석 (1M/3M/1Y 트렌드)                       │   │
│  │    - 긍정/부정 요인 도출                                  │   │
│  │  Output: Markdown Report                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓                                     │
│  Phase 3: Prediction & Recommendation                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Input: Enriched Data + Report                           │   │
│  │  Model: Gemini 3 Pro (Advanced Reasoning)                │   │
│  │  Task:                                                   │   │
│  │    - 단기 전망 (1주일)                                    │   │
│  │    - 장기 전망 (1개월)                                    │   │
│  │    - 목표가 및 예상 범위                                  │   │
│  │    - 주요 리스크/모멘텀                                   │   │
│  │    - 투자 의견 (Bullish/Neutral/Bearish)                │   │
│  │  Output: Prediction JSON                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 비용 최적화 모델 선택

| Phase | 모델 | 이유 | 예상 비용 |
|-------|------|------|----------|
| **1: 데이터 보강** | Gemini 2.5 Flash | 빠름, 저렴, 충분한 정확도 | ~$0.01/종목 |
| **2: 리포트 생성** | Gemini 2.5 Flash | 긴 출력, 고품질 텍스트 | ~$0.02/종목 |
| **3: 예측** | Gemini 3 Pro | 고급 추론 필요 | ~$0.05/종목 |
| **총계** | - | - | **~$0.08/종목** |

---

## 6. Layer 5: 출력 및 스토리지

### 6.1 최적 스케줄링 (접근법 1 + 개선)

```yaml
# .github/workflows/optimal_analysis.yml
name: Optimal Stock Analysis

on:
  schedule:
    # KST 기준 최적 시간 (장 시작 전, 점심, 장 마감 후)
    - cron: '0 23 * * 1-5'  # KST 08:00 (월-금)
    - cron: '0 4 * * 1-5'   # KST 13:00 (월-금)
    - cron: '0 13 * * 1-5'  # KST 22:00 (월-금)

  workflow_dispatch:
    inputs:
      stock_code:
        description: '분석할 종목 코드'
        required: false
      force_ocr:
        description: 'API 실패 시에도 OCR 강제 실행'
        type: boolean
        default: false

  repository_dispatch:
    types: [manual_analysis, stock_added]

concurrency:
  group: analysis-${{ github.ref }}
  cancel-in-progress: false  # 진행 중인 분석 보호

jobs:
  collect:
    runs-on: ubuntu-latest
    outputs:
      data_status: ${{ steps.collect.outputs.status }}
    steps:
      - name: Collect via APIs (Layer 1)
        id: collect
        run: |
          # 1순위: 공공데이터포털
          # 2순위: 한국투자증권 API
          # Dual-Source 검증 실행

  analyze:
    needs: collect
    if: needs.collect.outputs.data_status == 'success'
    runs-on: ubuntu-latest
    steps:
      - name: Run AI Analysis (Layer 4)
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: npm run analyze

  fallback:
    needs: collect
    if: needs.collect.outputs.data_status == 'failed'
    runs-on: ubuntu-latest
    steps:
      - name: Screenshot OCR Fallback (Layer 3)
        run: |
          npm run scrape
          npm run analyze -- --ocr-mode
```

### 6.2 데이터 구조 (통합 최적화)

```json
{
  "lastUpdated": "2026-01-26T13:00:00+09:00",
  "dataSource": {
    "primary": "public-data-portal",
    "secondary": "kis-api",
    "fallbackUsed": false
  },
  "validation": {
    "dualSourceVerified": true,
    "confidence": 0.98,
    "warnings": []
  },
  "pipeline": {
    "phase1": "gemini-2.5-flash",
    "phase2": "gemini-2.5-flash",
    "phase3": "gemini-3-pro"
  },
  "stocks": [
    {
      "code": "069500",
      "name": "KODEX 200",
      "extracted_data": {
        "currentPrice": 35420,
        "priceChange": -120,
        "changePercent": -0.34,
        "confidence": 0.98
      },
      "ai_report": "## 기술적 분석\n...",
      "prediction": "Neutral",
      "outlook": {
        "shortTerm": { "prediction": "횡보", "confidence": "중간" },
        "longTerm": { "prediction": "상승", "confidence": "높음" }
      }
    }
  ]
}
```

---

## 7. 비용 분석

### 7.1 월간 예상 비용 (10종목 기준)

| 항목 | 계산 | 월 비용 |
|------|------|---------|
| **공공데이터포털** | 무료 | $0 |
| **한국투자증권 API** | 무료 (계좌 필요) | $0 |
| **Finnhub API** | 무료 플랜 | $0 |
| **Gemini API** | 10종목 × 3회/일 × 30일 × $0.08 | ~$72 |
| **GitHub Actions** | 퍼블릭 레포 무료 | $0 |
| **총계** | | **~$72/월** |

### 7.2 비용 최적화 전략

```
1. 시맨틱 캐싱: 동일 요청 재사용 → 30% 절감
2. 주말 분석 건너뛰기: 5/7 = 28% 절감
3. 변동 없는 종목 스킵: ~20% 절감

최적화 후 예상: ~$35/월
```

---

## 8. 구현 로드맵

### Phase 1: 기반 구축 (1-2주)

```
□ 공공데이터포털 API 연동
□ 한국투자증권 OpenAPI 계정 및 연동
□ Finnhub API 연동
□ 기본 Validation Engine 구현
□ GitHub Actions 워크플로우 설정
```

### Phase 2: 검증 시스템 (2-3주)

```
□ Dual-Source 교차검증 구현
□ Confidence Scoring 시스템
□ Circuit Breaker 패턴 적용
□ 캐싱 레이어 추가
□ 모니터링/알림 설정
```

### Phase 3: AI 파이프라인 (2-3주)

```
□ AI Gateway 설정 (Gemini + Fallback)
□ 3단계 분석 파이프라인 구현
□ OCR Fallback 시스템
□ 결과 검증 로직
□ 리포트 포맷 최적화
```

### Phase 4: 안정화 (1-2주)

```
□ 에러 처리 강화
□ 성능 최적화
□ 비용 모니터링
□ 문서화
□ 테스트 커버리지
```

---

## 9. 최종 기술 스택 요약

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPTIMAL TECH STACK                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Frontend:        React + Vite + Tailwind CSS                   │
│  Backend:         Node.js (Scripts) + Python (선택적)            │
│  Hosting:         GitHub Pages (Static)                         │
│  CI/CD:           GitHub Actions                                │
│                                                                 │
│  Korean Data:     공공데이터포털 + 한국투자증권 OpenAPI           │
│  US Data:         Finnhub + Yahoo Finance API                   │
│  Validation:      Custom Dual-Source Engine                     │
│                                                                 │
│  AI Primary:      Google Gemini 2.5 Flash                       │
│  AI Reasoning:    Google Gemini 3 Pro                           │
│  AI Fallback:     Groq Llama 4 Scout → Claude                   │
│                                                                 │
│  Screenshot:      Playwright (Chromium)                         │
│  HTTP Client:     curl_cffi (TLS Fingerprint)                   │
│                                                                 │
│  Storage:         JSON Files in GitHub Repo                     │
│  Caching:         In-Memory + File-based                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 10. 결론

### 핵심 원칙

1. **API First**: 크롤링보다 항상 공식 API 우선
2. **Dual-Source**: 단일 소스 의존 금지, 항상 교차검증
3. **AI as Fallback**: AI OCR은 응급용, 주요 방식이 아님
4. **Graceful Degradation**: 실패해도 서비스는 계속
5. **Cost Awareness**: 비용 모니터링 및 최적화

### 3개 접근법에서 채택한 것

| 접근법 | 채택한 요소 |
|--------|------------|
| **01** | 3-Phase AI Pipeline, Playwright 설정, GitHub Actions |
| **02** | Multi-API 전략, Dual-Source 개념, 포괄적 데이터 커버리지 |
| **03** | Confidence Scoring, Validation Engine, TLS Fingerprint |

### 최종 추천

이 최적 아키텍처는 **세 가지 접근법의 장점만 결합**하여:

- **안정성**: 공식 API + Dual-Source 검증
- **정확도**: Gemini 95%+ OCR + 교차검증
- **비용 효율**: 무료 API 최대 활용 + AI 최적화
- **유지보수성**: 모듈화된 레이어 구조
- **법적 안전**: 공식 API만 사용, 크롤링 최소화

를 동시에 달성합니다.

---

*최적 아키텍처 설계 완료: 2026-01-26*
