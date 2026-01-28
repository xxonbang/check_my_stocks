# 프로젝트 기술 스택

> **프로젝트**: Check My Stocks
> **버전**: 1.0.0
> **최종 업데이트**: 2026-01-27

---

## Frontend

| 기술 | 버전 | 용도 |
|------|------|------|
| **React** | 18.3.1 | UI 프레임워크 |
| **Vite** | 5.4.10 | 빌드 도구 / 개발 서버 |
| **Tailwind CSS** | 3.4.14 | 유틸리티 기반 CSS |
| **Radix UI** | 1.1.0 | Headless UI 컴포넌트 (Tabs, Slot) |
| **Lucide React** | 0.460.0 | 아이콘 라이브러리 |
| **React Markdown** | 9.0.1 | 마크다운 렌더링 |

---

## Backend / Automation

| 기술 | 버전 | 용도 |
|------|------|------|
| **Node.js** | 20.x | 스크립트 실행 환경 |
| **Playwright** | 1.48.0 | 브라우저 자동화 / 스크린샷 캡처 |
| **Google Generative AI** | 0.21.0 | Gemini Vision API (OCR + 분석) |

---

## AI 모델

| 모델 | 용도 | 우선순위 |
|------|------|----------|
| **Gemini 2.5 Flash** | OCR (스크린샷 → 데이터 추출) | 1순위 |
| **Gemini 2.5 Flash** | 리포트 생성 | 1순위 |
| **Gemini 3 Pro** | 전망 예측 (추론) | 1순위 |
| **DeepSeek R1** | 전망 예측 (추론) | Fallback |
| **Groq Llama 4 Scout** | Vision OCR | Fallback |
| **Cloudflare Llama 3.2 Vision** | Vision OCR | Fallback |

---

## CI/CD & 배포

| 기술 | 용도 |
|------|------|
| **GitHub Actions** | 자동화 파이프라인 (하루 2회: 08:00, 22:00 KST) |
| **GitHub Pages** | 정적 사이트 배포 |
| **Cloudflare Worker** | GitHub Actions 프록시 (선택적) |

---

## 유틸리티 라이브러리

| 라이브러리 | 버전 | 용도 |
|------------|------|------|
| **clsx** | 2.1.1 | 조건부 클래스명 |
| **tailwind-merge** | 2.5.4 | Tailwind 클래스 병합 |
| **class-variance-authority** | 0.7.0 | 컴포넌트 변형 관리 |
| **dotenv** | 17.2.3 | 환경변수 관리 |
| **autoprefixer** | 10.4.20 | CSS 벤더 프리픽스 |
| **postcss** | 8.4.47 | CSS 후처리 |

---

## 데이터 소스

| 소스 | 방식 | 용도 |
|------|------|------|
| **네이버 금융** | Playwright 스크린샷 | 종목 상세 페이지 캡처 |
| **네이버 모바일 API** | REST API | 종목 검색 / 상세 정보 |
| **GitHub API** | REST API | stocks.json CRUD |

---

## 인증 시스템

| 기술 | 용도 |
|------|------|
| **JWT** | 관리자 인증 토큰 |
| **SHA-256** | 비밀번호 해싱 |
| **LocalStorage** | 토큰 저장 |

---

## 프로젝트 구조

```
check_my_stocks/
├── src/
│   ├── components/          # React 컴포넌트
│   │   ├── Dashboard.jsx
│   │   ├── LoginModal.jsx
│   │   ├── StockCard.jsx
│   │   ├── StockDetail.jsx
│   │   ├── StockManager.jsx
│   │   ├── StockSearch.jsx
│   │   └── ui/              # Shadcn UI 컴포넌트
│   ├── lib/                 # 유틸리티 함수
│   │   ├── auth.js          # JWT 인증
│   │   ├── stockApi.js      # API 연동
│   │   ├── formatNumber.js  # 숫자 포맷팅
│   │   └── utils.js         # 공통 유틸리티
│   ├── App.jsx              # 메인 앱
│   ├── main.jsx             # 엔트리 포인트
│   └── index.css            # 글로벌 스타일
├── scripts/
│   ├── scraper.js           # Playwright 스크래퍼
│   └── analyzer.js          # AI 분석 파이프라인
├── data/
│   ├── stocks.json          # 종목 목록
│   ├── analysis_results.json # 분석 결과
│   └── scrape_metadata.json # 스크래핑 메타데이터
├── public/
│   ├── data/                # 빌드용 데이터 복사본
│   └── screenshots/         # 종목 스크린샷 (.png)
├── docs/                    # 문서
├── cloudflare-worker/       # CF Worker (선택적)
└── .github/workflows/       # GitHub Actions
```

---

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHECK MY STOCKS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Vite +    │    │  Playwright │    │   Gemini    │         │
│  │   React     │    │  Scraper    │    │  Vision AI  │         │
│  │             │    │             │    │             │         │
│  │  Frontend   │    │  Screenshot │    │  OCR +      │         │
│  │  Dashboard  │    │  Capture    │    │  Analysis   │         │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘         │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            ↓                                    │
│                  ┌─────────────────┐                           │
│                  │  GitHub Actions │                           │
│                  │  (2x daily)     │                           │
│                  └────────┬────────┘                           │
│                           ↓                                     │
│                  ┌─────────────────┐                           │
│                  │  GitHub Pages   │                           │
│                  │  (Static Host)  │                           │
│                  └─────────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 데이터 파이프라인

```
┌──────────────────────────────────────────────────────────────────┐
│                     3-Phase AI Pipeline                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Scraping                                               │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ stocks.json │ -> │  Playwright │ -> │ Screenshot  │          │
│  │ (종목 목록)  │    │  (브라우저)  │    │  (.png)     │          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                               ↓                  │
│  Phase 2: OCR + Analysis                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ Screenshot  │ -> │ Gemini 2.5  │ -> │ JSON Data   │          │
│  │  (.png)     │    │ Flash OCR   │    │ (추출 데이터)│          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                               ↓                  │
│  Phase 3: Report + Prediction                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │ JSON Data   │ -> │ Gemini 2.5  │ -> │ AI Report   │          │
│  │             │    │ Flash/3 Pro │    │ + Prediction│          │
│  └─────────────┘    └─────────────┘    └─────────────┘          │
│                                               ↓                  │
│  Output                                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              analysis_results.json                        │   │
│  │  • extracted_data (가격, 거래량, 차트 분석)                │   │
│  │  • ai_report (마크다운 리포트)                             │   │
│  │  • prediction (Bullish/Bearish/Neutral)                   │   │
│  │  • outlook (단기/장기 전망)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 환경 변수

| 변수명 | 용도 | 필수 |
|--------|------|------|
| `GEMINI_API_KEY_01` | Gemini API 키 (기본) | O |
| `GEMINI_API_KEY_02` | Gemini API 키 (Fallback 1) | X |
| `GEMINI_API_KEY_03` | Gemini API 키 (Fallback 2) | X |
| `OPENROUTER_API_KEY` | OpenRouter API 키 | X |
| `GROQ_API_KEY` | Groq API 키 | X |
| `CF_ACCOUNT_ID` | Cloudflare 계정 ID | X |
| `CF_API_TOKEN` | Cloudflare API 토큰 | X |
| `VITE_ADMIN_ID` | 관리자 ID | O |
| `VITE_ADMIN_PW_HASH` | 관리자 비밀번호 해시 | O |
| `VITE_JWT_SECRET` | JWT 서명 시크릿 | O |
| `VITE_GITHUB_PAT` | GitHub Personal Access Token | X |

---

*문서 작성일: 2026-01-27*
