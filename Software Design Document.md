📋 Project Specification: AI-Powered Stock Analysis System

1. Project Overview
   목적: Playwright 기반 스크래핑과 Google Gemini 2.5 Flash를 결합하여 주식 종목을 자동 분석하고 리포트를 제공하는 대시보드 구축.
   대상: 개인용 주식 포트폴리오 관리 및 AI 분석 리포트 자동 생성.
   배포 환경: GitHub Pages (static site).
   스케줄링: 하루 3회 자동 업데이트 (GitHub Actions 활용).
2. Tech Stack
   Frontend: React (Vite), Tailwind CSS, Shadcn UI, Lucide React (Icons).
   Automation/Scraping: Playwright (Node.js), GitHub Actions.
   AI Model: Google Gemini 1.5 Flash (Multimodal capabilities for image + text).
   Data Management: JSON files (acting as a flat-file database in the repository).
3. System Architecture & Workflow
   Step 1: Data Acquisition (Playwright)
   stocks.json 파일에서 종목 코드 및 이름 리스트 로드.
   Playwright를 고해상도(1920x1080 이상) Headless 모드로 실행.
   네이버 페이 증권 등 대상 URL 접속.
   Full Screen Capture: 페이지 전체 내용을 포함하도록 스크롤 및 뷰포트 최적화 후 이미지 저장.
   Step 2: AI Analysis (Gemini API)
   Batch Processing: 일일 호출 제한을 고려하여, 수집된 모든 종목 이미지와 관련 메타데이터를 단일 Prompt에 포함.
   Prompt Engineering:
   "첨부된 모든 이미지에서 종목별 [현재가, 등락률, 거래량, 주요 지표]를 JSON 구조로 추출하라."
   "추출된 데이터를 바탕으로 실시간 뉴스(Google Search Tool 사용 권장)를 결합하여 향후 전망 리포트를 작성하라."
   Response Format: 반드시 유효한 JSON 형태를 포함해야 함.
   Step 3: Deployment & Static Site Generation
   분석 결과(analysis_results.json)를 저장.
   Vite Build를 통해 정적 파일 생성.
   GitHub Pages로 gh-pages 브랜치 자동 배포.
4. 상세 기능 설계 (Implementation Details)
   4.1 스크래핑 로직 (Scraper Service)
   해상도 설정: viewport: { width: 1920, height: 2000 }, deviceScaleFactor: 2 (고선명 캡처).
   대기 전략: 네트워크 유휴 상태(networkidle)까지 대기하여 차트 및 지표 렌더링 보장.
   4.2 AI 프롬프트 상세 (Gemini 2.5 Flash)
   code
   Text
   [Role] 전문 주식 분석가 및 데이터 추출 전문가
   [Task]
5. 전달된 각 이미지 파일은 주식 종목의 상세 페이지다.
6. 이미지 내의 수치 데이터(가격, 시가총액, PER, PBR, 외인비율 등)를 정확히 추출하여 JSON으로 구성하라.
7. 각 종목에 대해 오늘 날짜의 최신 뉴스를 반영한 'AI 전망 분석 리포트'를 작성하라.
8. 모든 결과는 아래 JSON 구조를 엄격히 따라야 한다:
   {
   "stocks": [
   {
   "code": "487230",
   "name": "종목명",
   "extracted_data": { ... },
   "ai_report": "리포트 내용",
   "prediction": "Bullish/Bearish/Neutral"
   }
   ]
   }
   4.3 프론트엔드 UI/UX (Shadcn UI)
   Main Layout: 상단에 전체 요약 대시보드, 하단에 탭(Tabs) 기반 종목 구분.
   Tab Content:
   좌측: 추출된 주요 지표 카드형 UI (Shadcn Card).
   우측: AI 리포트 (Markdown 렌더링).
   Admin Mode:
   localStorage 혹은 환경변수를 통해 xxonbang 아이디 체크.
   관리자일 경우 '수동 분석 시작' 버튼 활성화 (GitHub Dispatch API 호출).
   4.4 데이터 관리 (CRUD)
   stocks.json 관리 페이지 제공.
   사용자가 화면에서 종목 추가/삭제 시, 해당 변경사항을 Commit/Push하거나 API 엔드포인트(GitHub API)를 통해 서버측 파일 업데이트.
9. CI/CD Pipeline (GitHub Actions)
   5.1 스케줄러 설정 (.github/workflows/daily_analysis.yml)
   Schedule: cron: "0 23, 4, 13 \* \* \*" (UTC 기준 오전 8시, 오후 1시, 오후 10시 KST 대응).
   Workflow Steps:
   Checkout Repo.
   Install Node.js & Playwright Dependencies.
   Run Scraper (Output: Images).
   Run AI Analysis Script (Input: Images -> Gemini API -> Output: results.json).
   Commit & Push results.json.
   Build & Deploy to GitHub Pages.
10. 필수 준수 사항 (Constraints)
    API 효율성: Gemini API 호출 시 모든 이미지를 단일 메시지에 InlineData로 포함하여 전송할 것.
    보안: Gemini API Key 및 관리자 정보는 GitHub Secrets로 관리하고 코드에 노출 금지.
    디자인: Shadcn UI의 Card, Tabs, Table, Badge 컴포넌트를 사용하여 깔끔하고 전문적인 금융 앱 느낌 유지.
    에러 핸들링: 스크래핑 실패 시 해당 종목을 스킵하고 로그를 남기며 전체 프로세스가 중단되지 않도록 설계.
