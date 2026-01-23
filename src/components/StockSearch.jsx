import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, ArrowLeft, Check, AlertCircle, Plus, X, Play, ExternalLink, Loader2, CheckCircle2, XCircle } from 'lucide-react';
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

function StockSearch({ onBack, isAdmin, githubToken, githubRepo }) {
  const [keyword, setKeyword] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [stockDetail, setStockDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [existingStocks, setExistingStocks] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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

    // 중복 체크
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

      // 기존 목록 갱신
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

  // 시간 포맷팅 (초 -> "X분 Y초")
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

  // 분석 시작
  const handleStartAnalysis = async () => {
    if (!selectedStock) return;

    const workflowUrl = `https://github.com/${githubRepo}/actions/workflows/daily_analysis.yml`;

    // PAT가 없으면 기존 방식(GitHub 페이지 열기)
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

    // PAT가 있으면 자동으로 워크플로우 트리거 + 진행률 추적
    setIsAnalyzing(true);
    const [owner, repo] = githubRepo.split('/');

    try {
      // 1. 워크플로우 트리거
      await triggerWorkflow({
        owner,
        repo,
        workflowId: 'daily_analysis.yml',
        ref: 'main',
        inputs: {},
        token: githubToken
      });

      // 2. 평균 소요 시간 조회
      const avgDuration = await getAverageWorkflowDuration({
        owner,
        repo,
        token: githubToken,
        workflowName: 'Daily Stock Analysis'
      });

      // 3. 진행률 모달 표시
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

      // 4. 새로 시작된 워크플로우 찾기
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

      // 5. 워크플로우 상태 폴링
      setProgressModal(prev => ({
        ...prev,
        status: 'running',
        statusText: '분석 진행 중...',
        runUrl: newRun.htmlUrl
      }));

      // 진행률 업데이트 인터벌
      const progressInterval = setInterval(() => {
        if (pollingRef.current?.cancelled) {
          clearInterval(progressInterval);
          return;
        }

        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsedSec = elapsedMs / 1000;
        const progress = Math.min((elapsedSec / avgDuration) * 100, 95); // 최대 95%

        setProgressModal(prev => prev ? {
          ...prev,
          elapsedSec,
          progress
        } : null);
      }, 1000);

      // 폴링으로 완료 대기
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

      // 6. 완료 처리
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-2 sm:gap-4">
        <Button onClick={onBack} variant="ghost" size="sm" className="px-2 sm:px-3">
          <ArrowLeft className="w-4 h-4 sm:mr-2" />
          <span className="hidden sm:inline">돌아가기</span>
        </Button>
        <h2 className="text-lg sm:text-xl font-semibold">종목 검색</h2>
      </div>

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
              autoFocus
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
              {searchResults.length > 10 && (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-2">
                  상위 10개 결과만 표시됩니다.
                </p>
              )}
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

            {/* 버튼 영역 */}
            <div className="pt-3 sm:pt-4 border-t space-y-2 sm:space-y-3">
              {/* 분석 시작 버튼 - 항상 표시 */}
              <Button
                onClick={handleStartAnalysis}
                disabled={isAnalyzing}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                {isAnalyzing ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                ) : (
                  <Play className="w-4 h-4 mr-2" />
                )}
                분석 시작
              </Button>

              {/* 분석 목록에 추가 버튼 */}
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
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary mr-2" />
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

              {/* 다른 종목 검색 버튼 */}
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
              <CardTitle className="flex items-center gap-2 text-red-500 text-base sm:text-lg pr-8">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                오류
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
                검색어: <strong>"{errorPopup.keyword}"</strong>
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {errorPopup.message}
              </p>
              <ul className="text-xs sm:text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>종목명을 정확히 입력했는지 확인해주세요</li>
                <li>띄어쓰기나 오타를 확인해주세요</li>
              </ul>
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
              <p className="text-xs sm:text-sm text-muted-foreground">
                다음 분석 실행 시 포함됩니다.
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
              <CardTitle className={`flex items-center gap-2 text-base sm:text-lg pr-8 ${
                analysisPopup.triggered ? 'text-green-600' : analysisPopup.error ? 'text-orange-500' : 'text-blue-600'
              }`}>
                {analysisPopup.triggered ? (
                  <Check className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                ) : (
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                )}
                {analysisPopup.triggered ? '분석 시작됨' : '분석 시작'}
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
              <p className={`text-xs sm:text-sm ${analysisPopup.error ? 'text-orange-600' : 'text-muted-foreground'}`}>
                {analysisPopup.message}
              </p>
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    window.open(analysisPopup.workflowUrl, '_blank');
                  }}
                  className={`w-full ${analysisPopup.triggered ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  {analysisPopup.triggered ? '진행 상황 확인' : 'GitHub Actions 열기'}
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

      {/* 분석 진행률 모달 (PAT 있을 때) */}
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
              {(progressModal.status === 'success' || progressModal.status === 'failed' || progressModal.status === 'error') && (
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

              {/* 진행률 바 */}
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

              {/* 시간 정보 */}
              <div className="flex justify-between text-xs sm:text-sm text-muted-foreground">
                <span>경과: {formatTime(progressModal.elapsedSec)}</span>
                {progressModal.estimatedSec > 0 && progressModal.status !== 'success' && (
                  <span>예상: {formatTime(progressModal.estimatedSec)}</span>
                )}
              </div>

              {/* 버튼 */}
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
                    onClick={() => {
                      setProgressModal(null);
                      window.location.reload(); // 새로고침으로 결과 반영
                    }}
                    className="w-full bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-4 h-4 mr-2" />
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
