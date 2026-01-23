import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Search, Check, AlertCircle, Plus, X, Play, ExternalLink,
  Loader2, CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus,
  ArrowLeft, RefreshCw, Cpu, ChevronRight
} from 'lucide-react';
import {
  searchStocks,
  getStockDetail,
  addStockToList,
  getCurrentStockList,
  triggerWorkflow,
  findLatestWorkflowRun,
  getAverageWorkflowDuration,
  pollWorkflowUntilComplete
} from '@/lib/stockApi';
import { formatValue } from '@/lib/formatNumber';

function StockSearch({ isAdmin, githubToken, githubRepo, onAnalysisComplete, existingAnalysisData }) {
  // 뷰 모드: 'search' | 'result'
  const [viewMode, setViewMode] = useState('search');

  // 검색 관련 상태
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [stockDetail, setStockDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [existingStocks, setExistingStocks] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // 분석 결과 상태
  const [analysisResult, setAnalysisResult] = useState(null);
  const [isLoadingResult, setIsLoadingResult] = useState(false);

  // 팝업 상태
  const [errorPopup, setErrorPopup] = useState(null);
  const [successPopup, setSuccessPopup] = useState(null);
  const [analysisPopup, setAnalysisPopup] = useState(null);

  // 분석 진행 상태
  const [progressModal, setProgressModal] = useState(null);
  const pollingRef = useRef(null);
  const startTimeRef = useRef(null);

  // 기존 종목 목록 로드
  useEffect(() => {
    const loadExistingStocks = async () => {
      const stocks = await getCurrentStockList();
      setExistingStocks(stocks);
    };
    loadExistingStocks();
  }, []);

  // 종목 검색
  const handleSearch = async () => {
    if (!keyword.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    setSelectedStock(null);
    setStockDetail(null);

    try {
      const results = await searchStocks(keyword.trim());

      if (results.length === 0) {
        setErrorPopup({
          keyword: keyword.trim(),
          message: '입력하신 종목명으로 검색된 결과가 없습니다.'
        });
      } else {
        setSearchResults(results);
      }
    } catch (error) {
      setErrorPopup({
        keyword: keyword.trim(),
        message: error.message || '검색 중 오류가 발생했습니다.'
      });
    } finally {
      setIsSearching(false);
    }
  };

  // 종목 선택 시 상세 정보 조회
  const handleSelectStock = async (stock) => {
    setSelectedStock(stock);
    setIsLoadingDetail(true);
    setStockDetail(null);

    try {
      const detail = await getStockDetail(stock.code);
      setStockDetail(detail);
    } catch (error) {
      setErrorPopup({
        keyword: stock.name,
        message: error.message || '종목 정보를 가져올 수 없습니다.'
      });
      setSelectedStock(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 분석 목록에 추가
  const handleAddStock = async () => {
    if (!selectedStock || !stockDetail) return;

    const isDuplicate = existingStocks.some(s => s.code === selectedStock.code);
    if (isDuplicate) {
      setErrorPopup({
        keyword: selectedStock.name,
        message: '이미 분석 목록에 존재하는 종목입니다.'
      });
      return;
    }

    if (!isAdmin) {
      setErrorPopup({
        keyword: selectedStock.name,
        message: '관리자 로그인이 필요합니다.'
      });
      return;
    }

    setIsAdding(true);

    try {
      await addStockToList(
        selectedStock.code,
        selectedStock.name,
        githubToken,
        githubRepo
      );

      setSuccessPopup({
        name: selectedStock.name,
        code: selectedStock.code
      });

      setExistingStocks([...existingStocks, {
        code: selectedStock.code,
        name: selectedStock.name
      }]);
    } catch (error) {
      setErrorPopup({
        keyword: selectedStock.name,
        message: error.message || '종목 추가에 실패했습니다.'
      });
    } finally {
      setIsAdding(false);
    }
  };

  // 가격 포맷팅
  const formatPrice = (price) => {
    return new Intl.NumberFormat('ko-KR').format(price);
  };

  // 변동률 색상
  const getChangeColor = (change) => {
    if (change > 0) return 'text-red-500';
    if (change < 0) return 'text-blue-500';
    return 'text-gray-500';
  };

  // Enter 키로 검색
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // 시간 포맷팅
  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}분 ${secs}초`;
    }
    return `${secs}초`;
  }, []);

  // 분석 취소
  const handleCancelAnalysis = useCallback(() => {
    if (pollingRef.current) {
      pollingRef.current.cancelled = true;
    }
    setProgressModal(null);
    setIsAnalyzing(false);
  }, []);

  // 분석 결과 가져오기
  const fetchAnalysisResult = async (stockCode, retries = 5) => {
    setIsLoadingResult(true);

    for (let i = 0; i < retries; i++) {
      try {
        // 캐시 무효화를 위해 timestamp 추가
        const response = await fetch(`${import.meta.env.BASE_URL}data/analysis_results.json?t=${Date.now()}`);
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        const stock = data.stocks?.find(s => s.code === stockCode);

        if (stock) {
          setAnalysisResult(stock);
          setViewMode('result');
          setIsLoadingResult(false);
          return stock;
        }
      } catch (error) {
        console.error('Fetch attempt failed:', error);
      }

      // 재시도 전 대기 (배포 완료 대기)
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    setIsLoadingResult(false);
    return null;
  };

  // 분석 시작
  const handleStartAnalysis = async () => {
    if (!selectedStock) return;

    const workflowUrl = `https://github.com/${githubRepo}/actions/workflows/daily_analysis.yml`;

    // PAT가 없으면 기존 방식
    if (!githubToken) {
      setAnalysisPopup({
        name: selectedStock.name,
        code: selectedStock.code,
        workflowUrl,
        triggered: false,
        message: 'GitHub Actions 페이지에서 "Run workflow" 버튼을 클릭하면 분석이 시작됩니다.'
      });
      return;
    }

    setIsAnalyzing(true);
    const [owner, repo] = githubRepo.split('/');

    try {
      await triggerWorkflow({
        owner,
        repo,
        workflowId: 'daily_analysis.yml',
        ref: 'main',
        inputs: {},
        token: githubToken
      });

      const avgDuration = await getAverageWorkflowDuration({
        owner,
        repo,
        token: githubToken,
        workflowName: 'Daily Stock Analysis'
      });

      startTimeRef.current = Date.now();
      pollingRef.current = { cancelled: false };

      setProgressModal({
        name: selectedStock.name,
        code: selectedStock.code,
        workflowUrl,
        status: 'finding',
        statusText: '워크플로우 검색 중...',
        elapsedSec: 0,
        estimatedSec: avgDuration,
        progress: 0,
        runUrl: null
      });

      const newRun = await findLatestWorkflowRun({
        owner,
        repo,
        token: githubToken,
        maxWaitMs: 30000,
        pollIntervalMs: 2000
      });

      if (pollingRef.current?.cancelled) return;

      if (!newRun) {
        setProgressModal(prev => ({
          ...prev,
          status: 'error',
          statusText: '워크플로우를 찾을 수 없습니다',
        }));
        return;
      }

      setProgressModal(prev => ({
        ...prev,
        status: 'running',
        statusText: '분석 진행 중...',
        runUrl: newRun.htmlUrl
      }));

      const progressInterval = setInterval(() => {
        if (pollingRef.current?.cancelled) {
          clearInterval(progressInterval);
          return;
        }

        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsedSec = elapsedMs / 1000;
        const progress = Math.min((elapsedSec / avgDuration) * 100, 95);

        setProgressModal(prev => prev ? {
          ...prev,
          elapsedSec,
          progress
        } : null);
      }, 1000);

      const finalRun = await pollWorkflowUntilComplete({
        owner,
        repo,
        runId: newRun.id,
        token: githubToken,
        pollIntervalMs: 10000,
        maxWaitMs: 600000,
        onProgress: ({ status, conclusion }) => {
          if (pollingRef.current?.cancelled) return;

          let statusText = '분석 진행 중...';
          if (status === 'queued') statusText = '대기 중...';
          else if (status === 'in_progress') statusText = '분석 진행 중...';

          setProgressModal(prev => prev ? {
            ...prev,
            status: status === 'completed' ? (conclusion === 'success' ? 'success' : 'failed') : 'running',
            statusText
          } : null);
        }
      });

      clearInterval(progressInterval);

      if (pollingRef.current?.cancelled) return;

      const success = finalRun.conclusion === 'success';
      setProgressModal(prev => prev ? {
        ...prev,
        status: success ? 'success' : 'failed',
        statusText: success ? '분석 완료!' : '분석 실패',
        progress: 100,
        elapsedSec: (Date.now() - startTimeRef.current) / 1000
      } : null);

    } catch (error) {
      console.error('분석 오류:', error);
      setProgressModal(prev => prev ? {
        ...prev,
        status: 'error',
        statusText: error.message || '오류가 발생했습니다'
      } : {
        name: selectedStock.name,
        code: selectedStock.code,
        workflowUrl,
        status: 'error',
        statusText: error.message || '워크플로우 트리거에 실패했습니다',
        elapsedSec: 0,
        estimatedSec: 0,
        progress: 0,
        runUrl: null
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 결과 확인하기 버튼 핸들러
  const handleViewResult = async () => {
    if (!progressModal) return;

    setProgressModal(prev => ({
      ...prev,
      statusText: '결과 로딩 중...'
    }));

    // 배포 완료 대기 후 결과 가져오기
    const result = await fetchAnalysisResult(progressModal.code);

    if (result) {
      setProgressModal(null);
    } else {
      // 결과를 찾을 수 없음 - 배포 지연 또는 로컬 환경
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const productionUrl = `https://${githubRepo.split('/')[0]}.github.io/${githubRepo.split('/')[1]}/`;

      setProgressModal(null);
      setErrorPopup({
        keyword: progressModal.name,
        message: isLocalhost
          ? `로컬 환경에서는 분석 결과를 바로 확인할 수 없습니다. GitHub Pages 배포 완료 후 프로덕션 사이트에서 확인해주세요.`
          : `분석 결과 배포가 아직 완료되지 않았습니다. 잠시 후 페이지를 새로고침하거나 포트폴리오 탭에서 확인해주세요.`,
        productionUrl: isLocalhost ? productionUrl : null
      });
    }
  };

  // 검색 화면으로 돌아가기
  const handleBackToSearch = () => {
    setViewMode('search');
    setAnalysisResult(null);
  };

  // 예측 배지
  const getPredictionBadge = (prediction) => {
    switch (prediction) {
      case 'Bullish':
        return <Badge variant="success" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">상승 전망</Badge>;
      case 'Bearish':
        return <Badge variant="destructive" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">하락 전망</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">중립</Badge>;
    }
  };

  const getPredictionIcon = (prediction) => {
    switch (prediction) {
      case 'Bullish':
        return <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />;
      case 'Bearish':
        return <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />;
      default:
        return <Minus className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />;
    }
  };

  // 분석 결과 뷰
  if (viewMode === 'result' && analysisResult) {
    const { code, name, extracted_data, prediction, ai_report, pipeline, outlook } = analysisResult;
    const data = extracted_data || {};

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <Button onClick={handleBackToSearch} variant="ghost" size="sm" className="px-2 sm:px-3">
            <ArrowLeft className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">새 검색</span>
          </Button>
          <h2 className="text-lg sm:text-xl font-semibold flex-1 text-center">분석 결과</h2>
          <div className="w-20"></div>
        </div>

        {/* AI 파이프라인 정보 */}
        {pipeline && (
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200 rounded-lg p-2 sm:p-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Cpu className="w-3.5 h-3.5" />
                <span className="font-medium">AI 분석 파이프라인</span>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-xs">
                <div className="flex items-center gap-1 bg-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-purple-200">
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="font-medium text-purple-700">{pipeline.ocr?.replace(' API', '') || '-'}</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <div className="flex items-center gap-1 bg-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-blue-200">
                  <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  <span className="font-medium text-blue-700">{pipeline.report?.replace(' API', '') || '-'}</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-400" />
                <div className="flex items-center gap-1 bg-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-green-200">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="font-medium text-green-700">{pipeline.prediction?.replace(' API', '') || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 종목 정보 헤더 */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl truncate">{name}</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground">{code}</p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {getPredictionIcon(prediction)}
                {getPredictionBadge(prediction)}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <div>
                <p className="text-xs text-muted-foreground">현재가</p>
                <p className="text-sm sm:text-base font-semibold">{formatValue(data.currentPrice)}원</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">전일대비</p>
                <p className={`text-sm sm:text-base font-semibold ${
                  String(data.changePercent || '').includes('+') ? 'text-red-500' :
                  String(data.changePercent || '').includes('-') ? 'text-blue-500' : ''
                }`}>
                  {data.priceChange} ({data.changePercent})
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">거래량</p>
                <p className="text-sm sm:text-base font-semibold">{formatValue(data.volume)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">시가총액</p>
                <p className="text-sm sm:text-base font-semibold">{formatValue(data.marketCap)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 전망 요약 */}
        {outlook && (
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-base sm:text-lg">투자 전망</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {outlook.shortTermOutlook && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">단기 전망 ({outlook.shortTermOutlook.period})</p>
                    <p className={`font-semibold ${
                      outlook.shortTermOutlook.prediction === '상승' ? 'text-red-500' :
                      outlook.shortTermOutlook.prediction === '하락' ? 'text-blue-500' : ''
                    }`}>
                      {outlook.shortTermOutlook.prediction}
                    </p>
                    {outlook.shortTermOutlook.priceRange && (
                      <p className="text-xs text-muted-foreground mt-1">
                        예상 범위: {formatValue(outlook.shortTermOutlook.priceRange.low)} ~ {formatValue(outlook.shortTermOutlook.priceRange.high)}원
                      </p>
                    )}
                  </div>
                )}
                {outlook.longTermOutlook && (
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <p className="text-xs text-muted-foreground mb-1">중기 전망 ({outlook.longTermOutlook.period})</p>
                    <p className={`font-semibold ${
                      outlook.longTermOutlook.prediction === '상승' ? 'text-red-500' :
                      outlook.longTermOutlook.prediction === '하락' ? 'text-blue-500' : ''
                    }`}>
                      {outlook.longTermOutlook.prediction}
                    </p>
                    {outlook.longTermOutlook.targetPrice && (
                      <p className="text-xs text-muted-foreground mt-1">
                        목표가: {formatValue(outlook.longTermOutlook.targetPrice)}원
                      </p>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* AI 분석 리포트 */}
        {ai_report && (
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
              <CardTitle className="text-base sm:text-lg">AI 분석 리포트</CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
              <div className="prose prose-sm max-w-none text-sm">
                <ReactMarkdown>{ai_report}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 포트폴리오로 이동 버튼 */}
        <div className="flex gap-2">
          <Button
            onClick={handleBackToSearch}
            variant="outline"
            className="flex-1"
          >
            <Search className="w-4 h-4 mr-2" />
            새 종목 검색
          </Button>
          <Button
            onClick={() => onAnalysisComplete && onAnalysisComplete(code)}
            className="flex-1"
          >
            <Check className="w-4 h-4 mr-2" />
            포트폴리오에서 보기
          </Button>
        </div>
      </div>
    );
  }

  // 검색 화면
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 검색 영역 */}
      <Card>
        <CardHeader className="pb-2 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Search className="w-4 h-4 sm:w-5 sm:h-5" />
            종목명으로 검색
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="예: 삼성전자, 카카오"
              className="flex-1 px-3 sm:px-4 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !keyword.trim()}
              className="w-full sm:w-auto"
            >
              {isSearching ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  검색
                </>
              )}
            </Button>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            예시: 삼성전자, 카카오, KODEX 미국나스닥100
          </p>
        </CardContent>
      </Card>

      {/* 검색 결과 목록 */}
      {searchResults.length > 0 && !selectedStock && (
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">검색 결과 ({searchResults.length}건)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {searchResults.slice(0, 10).map((stock) => {
                const isExisting = existingStocks.some(s => s.code === stock.code);
                const hasAnalysis = existingAnalysisData?.stocks?.some(s => s.code === stock.code);
                return (
                  <div
                    key={stock.code}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-2 sm:p-3 border rounded-md hover:bg-slate-50 transition-colors gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2">
                        <span className="font-medium text-sm sm:text-base truncate">{stock.name}</span>
                        <span className="text-xs sm:text-sm text-muted-foreground">({stock.code})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        {stock.market && (
                          <span className="text-xs text-muted-foreground">{stock.market}</span>
                        )}
                        {isExisting && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            분석 목록
                          </span>
                        )}
                        {hasAnalysis && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            분석 완료
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSelectStock(stock)}
                      className="w-full sm:w-auto"
                    >
                      선택
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 상세 정보 로딩 */}
      {isLoadingDetail && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-4" />
              <p className="text-muted-foreground">종목 정보를 불러오는 중...</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 종목 상세 정보 */}
      {selectedStock && stockDetail && (
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg text-green-600">
              <Check className="w-4 h-4 sm:w-5 sm:h-5" />
              종목 확인됨
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">종목명</p>
                <p className="font-medium text-sm sm:text-base">{stockDetail.name || selectedStock.name}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">종목코드</p>
                <p className="font-medium text-sm sm:text-base">{selectedStock.code}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">현재가</p>
                <p className="font-medium text-sm sm:text-base">{formatPrice(stockDetail.currentPrice)}원</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">전일대비</p>
                <p className={`font-medium text-sm sm:text-base ${getChangeColor(stockDetail.changePrice)}`}>
                  {stockDetail.changePrice > 0 ? '+' : ''}{formatPrice(stockDetail.changePrice)}
                  <span className="text-xs sm:text-sm">
                    {' '}({stockDetail.changeRate > 0 ? '+' : ''}{stockDetail.changeRate}%)
                  </span>
                </p>
              </div>
            </div>

            <div className="pt-3 sm:pt-4 border-t space-y-2 sm:space-y-3">
              <Button
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                분석 시작
              </Button>

              {existingStocks.some(s => s.code === selectedStock.code) ? (
                <div className="flex items-center justify-center gap-2 text-green-600 text-xs sm:text-sm py-1">
                  <Check className="w-4 h-4" />
                  <span>분석 목록에 있는 종목입니다.</span>
                </div>
              ) : (
                <Button
                  onClick={handleAddStock}
                  disabled={isAdding || !isAdmin}
                  className="w-full"
                  variant="outline"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-2" />
                  )}
                  분석 목록에 추가
                </Button>
              )}

              {!isAdmin && !existingStocks.some(s => s.code === selectedStock.code) && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center">
                  관리자 로그인 시에만 추가 가능합니다.
                </p>
              )}

              <Button
                variant="outline"
                onClick={() => {
                  setSelectedStock(null);
                  setStockDetail(null);
                }}
                className="w-full"
              >
                다른 종목 선택
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 오류 팝업 */}
      {errorPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm sm:max-w-md">
            <CardHeader className="relative pb-2">
              <CardTitle className="flex items-center gap-2 text-amber-500 text-base sm:text-lg pr-8">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                {errorPopup.productionUrl ? '안내' : '오류'}
              </CardTitle>
              <button
                onClick={() => setErrorPopup(null)}
                className="absolute right-3 top-3 sm:right-4 sm:top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <p className="text-xs sm:text-sm">
                종목: <strong>{errorPopup.keyword}</strong>
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {errorPopup.message}
              </p>
              {errorPopup.productionUrl && (
                <Button
                  onClick={() => window.open(errorPopup.productionUrl, '_blank')}
                  variant="outline"
                  className="w-full"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  프로덕션 사이트 열기
                </Button>
              )}
              <Button onClick={() => setErrorPopup(null)} className="w-full">
                확인
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 추가 성공 팝업 */}
      {successPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm sm:max-w-md">
            <CardHeader className="relative pb-2">
              <CardTitle className="flex items-center gap-2 text-green-500 text-base sm:text-lg pr-8">
                <Check className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                추가 완료
              </CardTitle>
              <button
                onClick={() => setSuccessPopup(null)}
                className="absolute right-3 top-3 sm:right-4 sm:top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <p className="text-xs sm:text-sm">
                <strong>{successPopup.name}</strong> ({successPopup.code})가
                분석 목록에 추가되었습니다.
              </p>
              <Button onClick={() => setSuccessPopup(null)} className="w-full">
                확인
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 분석 시작 팝업 (PAT 없을 때) */}
      {analysisPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm sm:max-w-md">
            <CardHeader className="relative pb-2">
              <CardTitle className="flex items-center gap-2 text-blue-600 text-base sm:text-lg pr-8">
                <Play className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                분석 시작
              </CardTitle>
              <button
                onClick={() => setAnalysisPopup(null)}
                className="absolute right-3 top-3 sm:right-4 sm:top-4 text-muted-foreground hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <p className="text-xs sm:text-sm">
                <strong>{analysisPopup.name}</strong> ({analysisPopup.code})
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {analysisPopup.message}
              </p>
              <div className="space-y-2">
                <Button
                  onClick={() => window.open(analysisPopup.workflowUrl, '_blank')}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  GitHub Actions 열기
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setAnalysisPopup(null)}
                  className="w-full"
                >
                  닫기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 분석 진행률 모달 */}
      {progressModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm sm:max-w-md">
            <CardHeader className="relative pb-2">
              <CardTitle className={`flex items-center gap-2 text-base sm:text-lg pr-8 ${
                progressModal.status === 'success' ? 'text-green-600' :
                progressModal.status === 'failed' || progressModal.status === 'error' ? 'text-red-500' :
                'text-blue-600'
              }`}>
                {progressModal.status === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                ) : progressModal.status === 'failed' || progressModal.status === 'error' ? (
                  <XCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 animate-spin" />
                )}
                {progressModal.status === 'success' ? '분석 완료' :
                 progressModal.status === 'failed' ? '분석 실패' :
                 progressModal.status === 'error' ? '오류 발생' :
                 '분석 진행 중'}
              </CardTitle>
              {(progressModal.status === 'failed' || progressModal.status === 'error') && (
                <button
                  onClick={() => setProgressModal(null)}
                  className="absolute right-3 top-3 sm:right-4 sm:top-4 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs sm:text-sm">
                <strong>{progressModal.name}</strong> ({progressModal.code})
              </p>

              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{progressModal.statusText}</span>
                  <span>{Math.round(progressModal.progress)}%</span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      progressModal.status === 'success' ? 'bg-green-500' :
                      progressModal.status === 'failed' || progressModal.status === 'error' ? 'bg-red-500' :
                      'bg-blue-500'
                    }`}
                    style={{ width: `${progressModal.progress}%` }}
                  />
                </div>
              </div>

              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                <span>경과: {formatTime(progressModal.elapsedSec)}</span>
                {progressModal.estimatedSec > 0 && progressModal.status !== 'success' && (
                  <span>예상: {formatTime(progressModal.estimatedSec)}</span>
                )}
              </div>

              <div className="space-y-2 pt-2">
                {progressModal.runUrl && (
                  <Button
                    onClick={() => window.open(progressModal.runUrl, '_blank')}
                    variant="outline"
                    className="w-full"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    GitHub에서 확인
                  </Button>
                )}

                {progressModal.status === 'success' && (
                  <Button
                    onClick={handleViewResult}
                    disabled={isLoadingResult}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    {isLoadingResult ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    결과 확인하기
                  </Button>
                )}

                {(progressModal.status === 'failed' || progressModal.status === 'error') && (
                  <Button
                    onClick={() => setProgressModal(null)}
                    variant="outline"
                    className="w-full"
                  >
                    닫기
                  </Button>
                )}

                {progressModal.status !== 'success' && progressModal.status !== 'failed' && progressModal.status !== 'error' && (
                  <Button
                    onClick={handleCancelAnalysis}
                    variant="outline"
                    className="w-full text-muted-foreground"
                  >
                    백그라운드에서 계속
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default StockSearch;
