# Check My Stocks - 데이터 출처 및 획득 방식

## 목차
1. [개요](#개요)
2. [데이터 흐름](#데이터-흐름)
3. [데이터 출처 상세](#데이터-출처-상세)
   - [네이버 금융 (웹 스크래핑)](#1-네이버-금융-웹-스크래핑)
   - [네이버 금융 API](#2-네이버-금융-api)
   - [AI 분석 API](#3-ai-분석-api)
   - [GitHub API](#4-github-api)
4. [출처별 요약 테이블](#출처별-요약-테이블)

---

## 개요

이 프로젝트는 한국 주식/ETF의 기술적 분석 및 AI 기반 투자 리포트를 자동 생성합니다.

**핵심 파이프라인:**
```
종목 목록 (stocks.json)
    ↓
스크래퍼 (Playwright) → 네이버 금융 페이지 스크린샷
    ↓
AI 분석 파이프라인 (3단계)
    ├─ Phase 1: OCR (Vision 모델) → 데이터 추출
    ├─ Phase 2: Report (Text 모델) → 분석 리포트 생성
    └─ Phase 3: Prediction (Reasoning 모델) → 전망 예측
    ↓
분석 결과 저장 (analysis_results.json)
    ↓
웹 대시보드 표시
```

---

## 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Frontend (React)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  StockSearch.jsx                    StockManager.jsx                         │
│       │                                  │                                   │
│       ▼                                  ▼                                   │
│  네이버 금융 API ◄──────────────── GitHub API                               │
│  (검색/상세정보)                    (stocks.json CRUD)                       │
│       │                                  │                                   │
│       │                     ┌────────────┘                                   │
│       │                     ▼                                                │
│       │            GitHub Actions 트리거                                     │
└───────┼─────────────────────┼───────────────────────────────────────────────┘
        │                     │
        │                     ▼
┌───────┼─────────────────────────────────────────────────────────────────────┐
│       │              GitHub Actions Workflow                                 │
├───────┼─────────────────────────────────────────────────────────────────────┤
│       │                     │                                                │
│       │          ┌──────────┴──────────┐                                     │
│       │          ▼                     ▼                                     │
│       │    scraper.js            analyzer.js                                 │
│       │    (Playwright)          (AI Pipeline)                               │
│       │          │                     │                                     │
│       │          ▼                     ▼                                     │
│       │    네이버 금융            AI API 호출                                │
│       │    스크린샷 캡쳐          ├─ Gemini                                 │
│       │          │               ├─ OpenRouter                               │
│       │          │               ├─ Groq                                     │
│       │          │               └─ Cloudflare                               │
│       │          │                     │                                     │
│       │          ▼                     ▼                                     │
│       │    screenshots/         analysis_results.json                        │
│       │    {code}.png                                                        │
└───────┼─────────────────────────────────────────────────────────────────────┘
        │
        ▼
   CORS Proxy
   (corsproxy.io)
```

---

## 데이터 출처 상세

### 1. 네이버 금융 (웹 스크래핑)

#### 출처
- **URL 패턴**: `https://m.stock.naver.com/domestic/stock/{종목코드}/total`
- **예시**: `https://m.stock.naver.com/domestic/stock/005930/total` (삼성전자)

#### 획득 방식
- **도구**: Playwright (Chromium 브라우저 자동화)
- **파일**: `scripts/scraper.js`

#### 수집 데이터
| 데이터 | 설명 |
|--------|------|
| 전체 페이지 스크린샷 | 종목 상세 페이지 전체 캡쳐 (PNG) |

#### 기술적 세부사항
```javascript
// 브라우저 설정
const context = await browser.newContext({
  viewport: { width: 1920, height: 2000 },
  deviceScaleFactor: 2,           // 고해상도 캡쳐
  locale: 'ko-KR',                // 한국어 설정
  userAgent: 'Mozilla/5.0 (Macintosh; ...) Chrome/120.0.0.0'
});

// 페이지 로드 및 캡쳐
await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);  // 렌더링 대기

// 자동 스크롤 (전체 콘텐츠 로드)
await page.evaluate(async () => {
  // 300px씩 스크롤하며 전체 페이지 로드
});

// 전체 페이지 스크린샷
await page.screenshot({ path: screenshotPath, fullPage: true });
```

#### 저장 위치
- 스크린샷: `public/screenshots/{종목코드}.png`
- 메타데이터: `data/scrape_metadata.json`

---

### 2. 네이버 금융 API

#### 출처
| API | URL |
|-----|-----|
| 자동완성 검색 | `https://ac.stock.naver.com/ac` |
| 종목 기본 정보 | `https://m.stock.naver.com/api/stock/{code}/basic` |

#### 획득 방식
- **도구**: fetch API + CORS Proxy
- **파일**: `src/lib/stockApi.js`
- **프록시**: `https://corsproxy.io/`

#### 수집 데이터

**종목 검색 API** (`searchStocks`)
```javascript
// 요청
GET https://ac.stock.naver.com/ac?q={keyword}&target=stock

// 응답 데이터
{
  items: [
    { code: "005930", name: "삼성전자", typeName: "KOSPI", category: "stock" },
    { code: "005935", name: "삼성전자우", typeName: "KOSPI", category: "stock" }
  ]
}
```

**종목 상세 정보 API** (`getStockDetail`)
```javascript
// 요청
GET https://m.stock.naver.com/api/stock/{code}/basic

// 응답 데이터
{
  stockName: "삼성전자",
  closePrice: "78,000",          // 현재가
  compareToPreviousClosePrice: "+500",  // 전일 대비
  fluctuationsRatio: "0.65",     // 등락률
  highPrice: "78,500",           // 고가
  lowPrice: "77,200",            // 저가
  openPrice: "77,800",           // 시가
  accumulatedTradingVolume: "12,345,678",  // 거래량
  marketCap: "465,123,456,789,000"  // 시가총액
}
```

#### 프록시 사용 이유
- CORS(Cross-Origin Resource Sharing) 정책으로 인해 프론트엔드에서 직접 네이버 API 호출 불가
- `corsproxy.io` 서비스를 통해 우회

---

### 3. AI 분석 API

#### 3단계 파이프라인 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                     3-Phase AI Pipeline                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Phase 1: OCR (Vision)                                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 스크린샷 이미지 → 데이터 추출                            │   │
│  │ • 가격 정보 (현재가, 시가, 고가, 저가, 전일)             │   │
│  │ • ETF 지표 (NAV, iNAV, 괴리율, 총보수)                  │   │
│  │ • 수익률 (1M, 3M, 1Y)                                   │   │
│  │ • 투자자 동향 (개인/외국인/기관)                         │   │
│  │ • 차트 분석 (추세, 이동평균선, 패턴)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  Phase 2: Report (Text)                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 추출된 데이터 → 종합 분석 리포트 생성                    │   │
│  │ • 기술적 분석                                           │   │
│  │ • 펀더멘털 분석                                         │   │
│  │ • 수익률 분석                                           │   │
│  │ • 수급 분석                                             │   │
│  │ • 긍정적/부정적 요인                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          ↓                                      │
│  Phase 3: Prediction (Reasoning)                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 데이터 + 리포트 → 전망 예측                             │   │
│  │ • 단기 전망 (1주일)                                     │   │
│  │ • 장기 전망 (1개월)                                     │   │
│  │ • 주요 리스크                                           │   │
│  │ • 상승 모멘텀                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### Provider 목록 및 Fallback 순서

| Phase | 우선순위 | Provider | 모델 | 비고 |
|-------|---------|----------|------|------|
| **OCR** | 1 | Gemini | `gemini-2.5-flash` | 차트 분석 최고 품질 |
| | 2 | OpenRouter | `google/gemini-2.0-flash-exp:free` | 무료, 2026-02-06 지원종료 예정 |
| | 3 | Groq | `meta-llama/llama-4-scout-17b-16e-instruct` | Vision 지원 |
| | 4 | Cloudflare | `@cf/meta/llama-3.2-11b-vision-instruct` | Workers AI |
| **Report** | 1 | Gemini | `gemini-2.5-flash` | 고품질 텍스트 생성 |
| | 2 | Groq | `llama-3.3-70b-versatile` | 초고속 (460 tok/s) |
| | 3 | OpenRouter | `google/gemini-2.0-flash-exp:free` | 무료 백업 |
| **Prediction** | 1 | Gemini | `gemini-2.5-flash` | 고품질 추론 |
| | 2 | OpenRouter | `tngtech/deepseek-r1t2-chimera:free` | DeepSeek 추론 모델 |
| | 3 | OpenRouter | `tngtech/deepseek-r1t-chimera:free` | DeepSeek 백업 |
| | 4 | Groq | `llama-3.3-70b-versatile` | 최후 백업 |

#### API 상세

**Gemini API (Google)**
```javascript
// 엔드포인트: @google/generative-ai SDK 사용
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Vision (이미지 분석)
const result = await model.generateContent([prompt, {
  inlineData: { mimeType: "image/png", data: imageBase64 }
}]);

// Text (텍스트 생성)
const result = await model.generateContent(prompt);
```

**OpenRouter API**
```javascript
// 엔드포인트
POST https://openrouter.ai/api/v1/chat/completions

// 헤더
{
  "Authorization": "Bearer {OPENROUTER_API_KEY}",
  "HTTP-Referer": "https://github.com/xxonbang/check_my_stocks",
  "X-Title": "Check My Stocks"
}

// Vision 요청 본문
{
  "model": "google/gemini-2.0-flash-exp:free",
  "messages": [{
    "role": "user",
    "content": [
      { "type": "text", "text": prompt },
      { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." }}
    ]
  }],
  "max_tokens": 8192,
  "temperature": 0.1
}
```

**Groq API**
```javascript
// 엔드포인트
POST https://api.groq.com/openai/v1/chat/completions

// 헤더
{
  "Authorization": "Bearer {GROQ_API_KEY}"
}

// Vision 모델: meta-llama/llama-4-scout-17b-16e-instruct
// Text 모델: llama-3.3-70b-versatile
```

**Cloudflare Workers AI**
```javascript
// 엔드포인트
POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-3.2-11b-vision-instruct

// 헤더
{
  "Authorization": "Bearer {CF_API_TOKEN}"
}

// 요청 본문
{
  "prompt": prompt,
  "image": [imageBase64],
  "max_tokens": 8192
}
```

#### Fallback 로직
```javascript
// Provider 실패 시 다음 Provider로 자동 전환
const providerOrder = ["gemini", "openrouter", "groq", "cloudflare"];

for (const providerKey of providerOrder) {
  try {
    const result = await callProvider(providerKey, prompt, imageBase64);
    return result;  // 성공 시 반환
  } catch (error) {
    // Rate Limit (429), 서비스 불가 (503), 지원종료 (404/410) 시
    // Provider를 세션 내에서 비활성화하고 다음 Provider 시도
    if (shouldMarkProviderFailed(error)) {
      provider.failed = true;
    }
  }
}
```

---

### 4. GitHub API

#### 출처
- **Base URL**: `https://api.github.com`
- **인증**: Personal Access Token (PAT)

#### 기능별 API

**1. stocks.json CRUD**

| 작업 | 메서드 | 엔드포인트 |
|------|--------|-----------|
| 조회 | GET | `/repos/{owner}/{repo}/contents/data/stocks.json` |
| 추가/수정/삭제 | PUT | `/repos/{owner}/{repo}/contents/data/stocks.json` |

```javascript
// 파일 조회
GET https://api.github.com/repos/xxonbang/check_my_stocks/contents/data/stocks.json

// 파일 수정
PUT https://api.github.com/repos/xxonbang/check_my_stocks/contents/data/stocks.json
{
  "message": "Add stock: 삼성전자 (005930)",
  "content": "{base64_encoded_json}",
  "sha": "{current_file_sha}"
}
```

**2. GitHub Actions 워크플로우**

| 작업 | 메서드 | 엔드포인트 |
|------|--------|-----------|
| 워크플로우 트리거 | POST | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` |
| 실행 목록 조회 | GET | `/repos/{owner}/{repo}/actions/runs` |
| 특정 실행 조회 | GET | `/repos/{owner}/{repo}/actions/runs/{run_id}` |

```javascript
// 워크플로우 트리거 (workflow_dispatch)
POST https://api.github.com/repos/xxonbang/check_my_stocks/actions/workflows/daily_analysis.yml/dispatches
{
  "ref": "main",
  "inputs": {
    "stock_code": "005930",
    "stock_name": "삼성전자"
  }
}

// 응답: 204 No Content (성공)
```

#### 필요 권한 (Fine-grained PAT)
- **Repository access**: `check_my_stocks` 선택
- **Permissions**:
  - Contents: Read and Write (stocks.json 수정용)
  - Actions: Read and Write (워크플로우 트리거용)

---

## 출처별 요약 테이블

| 출처 | 타입 | 획득 방식 | 데이터 | 용도 | 파일 |
|------|------|----------|--------|------|------|
| 네이버 금융 | 웹 스크래핑 | Playwright 브라우저 자동화 | 종목 상세 페이지 스크린샷 | AI OCR 입력 | `scripts/scraper.js` |
| 네이버 금융 API | REST API | fetch + CORS Proxy | 종목 검색, 현재가, 시세 | 종목 검색/검증 | `src/lib/stockApi.js` |
| Gemini API | AI API | Google SDK | OCR, 리포트, 예측 | AI 분석 (Primary) | `scripts/analyzer.js` |
| OpenRouter API | AI API | REST API | Vision, Text, Reasoning | AI 분석 (Fallback) | `scripts/analyzer.js` |
| Groq API | AI API | REST API | Vision (Llama 4), Text | AI 분석 (Fallback) | `scripts/analyzer.js` |
| Cloudflare Workers AI | AI API | REST API | Vision (Llama 3.2) | AI 분석 (Fallback) | `scripts/analyzer.js` |
| GitHub Contents API | REST API | fetch | stocks.json | 종목 목록 CRUD | `src/lib/stockApi.js` |
| GitHub Actions API | REST API | fetch | 워크플로우 상태 | 분석 트리거/모니터링 | `src/lib/stockApi.js` |

---

## 환경 변수

| 변수명 | 용도 | 필수 |
|--------|------|------|
| `GEMINI_API_KEY_01~03` | Gemini API 키 (최대 3개, 로테이션) | O |
| `OPENROUTER_API_KEY` | OpenRouter API 키 | △ |
| `GROQ_API_KEY` | Groq API 키 | △ |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | △ |
| `CF_API_TOKEN` | Cloudflare API Token | △ |
| `VITE_GITHUB_PAT` | GitHub Personal Access Token | O |
| `VITE_ADMIN_ID` | 관리자 ID | O |
| `VITE_ADMIN_PW_HASH` | 관리자 비밀번호 해시 (SHA-256) | O |
| `VITE_JWT_SECRET` | JWT 서명 시크릿 | O |

> △: Fallback provider로 사용되므로 하나 이상 설정 권장

---

## 자동 실행 스케줄

GitHub Actions에서 매일 3회 자동 실행:

| KST 시간 | UTC Cron | 설명 |
|----------|----------|------|
| 08:00 | `0 23 * * *` | 장 시작 전 분석 |
| 13:00 | `0 4 * * *` | 점심 시간 분석 |
| 22:00 | `0 13 * * *` | 장 마감 후 분석 |

수동 트리거도 지원 (`workflow_dispatch`, `repository_dispatch`)
