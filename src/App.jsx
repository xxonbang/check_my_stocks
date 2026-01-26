import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart3, LogIn, LogOut, RefreshCw, Search, PieChart, Settings } from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import StockDetail from '@/components/StockDetail';
import LoginModal from '@/components/LoginModal';
import StockSearch from '@/components/StockSearch';
import StockManager from '@/components/StockManager';
import { login, checkAuth, logout as authLogout, saveToken } from '@/lib/auth';

const GITHUB_REPO = 'xxonbang/check_my_stocks';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [githubPat, setGithubPat] = useState(() => {
    return localStorage.getItem('githubPat') || import.meta.env.VITE_GITHUB_PAT || '';
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [mainTab, setMainTab] = useState('portfolio'); // 'portfolio' | 'search'

  // 데이터 로드 함수 (재사용 가능)
  const fetchData = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/analysis_results.json?t=${Date.now()}`);
      if (!response.ok) {
        throw new Error('Failed to load analysis data');
      }
      const jsonData = await response.json();
      setData(jsonData);
      if (jsonData.stocks && jsonData.stocks.length > 0 && !selectedStock) {
        setSelectedStock(jsonData.stocks[0]);
      }
      return jsonData;
    } catch (err) {
      setError(err.message);
      return null;
    }
  };

  // 초기 로드: 데이터 + 인증 상태 확인
  useEffect(() => {
    const initialize = async () => {
      // 인증 상태 확인 (JWT 검증)
      const authState = await checkAuth();
      setIsAdmin(authState.isAuthenticated);

      // 데이터 로드
      await fetchData();
      setLoading(false);
    };
    initialize();
  }, []);

  const handleLogin = async (id, pw, pat = '') => {
    const result = await login(id, pw);

    if (result.success) {
      saveToken(result.token);
      setIsAdmin(true);
      if (pat) {
        localStorage.setItem('githubPat', pat);
        setGithubPat(pat);
      }
      setShowLoginModal(false);
      return { success: true };
    }

    return { success: false, error: result.error };
  };

  const handleLogout = () => {
    authLogout();
    setIsAdmin(false);
    setGithubPat(import.meta.env.VITE_GITHUB_PAT || '');
  };

  const triggerAnalysis = () => {
    const workflowUrl = `https://github.com/${GITHUB_REPO}/actions/workflows/daily_analysis.yml`;
    window.open(workflowUrl, '_blank');
    setAnalysisMessage('GitHub Actions 페이지에서 "Run workflow" 버튼을 클릭하세요.');
    setTimeout(() => setAnalysisMessage(''), 8000);
  };

  // 분석 완료 후 결과 보기
  const handleViewAnalysisResult = async (stockCode) => {
    // 데이터 새로고침
    const newData = await fetchData();
    if (newData) {
      const stock = newData.stocks?.find(s => s.code === stockCode);
      if (stock) {
        setSelectedStock(stock);
        setMainTab('portfolio');
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <BarChart3 className="w-6 h-6 sm:w-8 sm:h-8 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-bold truncate">Check My Stocks</h1>
                <span className="text-xs text-muted-foreground hidden sm:inline">AI ETF 분석</span>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
              {analysisMessage && (
                <span className={`text-xs hidden sm:inline ${analysisMessage.includes('오류') ? 'text-red-500' : 'text-green-500'}`}>
                  {analysisMessage}
                </span>
              )}
              {isAdmin ? (
                <>
                  <Button
                    onClick={triggerAnalysis}
                    disabled={isAnalyzing}
                    size="sm"
                    variant="outline"
                    className="px-2 sm:px-3"
                  >
                    <RefreshCw className={`w-4 h-4 sm:mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isAnalyzing ? '분석 중...' : '수동 분석'}</span>
                  </Button>
                  <Button onClick={handleLogout} size="sm" variant="ghost" className="px-2 sm:px-3">
                    <LogOut className="w-4 h-4 sm:mr-2" />
                    <span className="hidden sm:inline">로그아웃</span>
                  </Button>
                </>
              ) : (
                <Button onClick={() => setShowLoginModal(true)} size="sm" variant="outline" className="px-2 sm:px-3">
                  <LogIn className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">로그인</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-6">
        {/* 메인 탭 네비게이션 */}
        <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
          <TabsList className={`grid w-full mb-4 sm:mb-6 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="portfolio" className="flex items-center gap-2 text-sm sm:text-base">
              <PieChart className="w-4 h-4" />
              <span>포트폴리오</span>
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2 text-sm sm:text-base">
              <Search className="w-4 h-4" />
              <span>종목 검색</span>
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="manage" className="flex items-center gap-2 text-sm sm:text-base">
                <Settings className="w-4 h-4" />
                <span>종목 관리</span>
              </TabsTrigger>
            )}
          </TabsList>

          {/* 포트폴리오 탭 */}
          <TabsContent value="portfolio" className="mt-0">
            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 text-red-700 text-sm">
                오류: {error}
              </div>
            ) : (
              <>
                <Dashboard data={data} />

                {data?.stocks && data.stocks.length > 0 && (
                  <Tabs
                    value={selectedStock?.code || data.stocks[0]?.code}
                    onValueChange={(value) => {
                      const stock = data.stocks.find(s => s.code === value);
                      setSelectedStock(stock);
                    }}
                  >
                    <TabsList className="flex-wrap h-auto gap-1 mb-3 sm:mb-4 w-full justify-start overflow-x-auto">
                      {data.stocks.map((stock) => (
                        <TabsTrigger
                          key={stock.code}
                          value={stock.code}
                          className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground whitespace-nowrap"
                        >
                          {stock.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {data.stocks.map((stock) => (
                      <TabsContent key={stock.code} value={stock.code}>
                        <StockDetail stock={stock} />
                      </TabsContent>
                    ))}
                  </Tabs>
                )}
              </>
            )}
          </TabsContent>

          {/* 종목 검색 탭 */}
          <TabsContent value="search" className="mt-0">
            <StockSearch
              isAdmin={isAdmin}
              githubToken={githubPat}
              githubRepo={GITHUB_REPO}
              onAnalysisComplete={handleViewAnalysisResult}
              existingAnalysisData={data}
            />
          </TabsContent>

          {/* 종목 관리 탭 (관리자 전용) */}
          {isAdmin && (
            <TabsContent value="manage" className="mt-0">
              <StockManager
                githubToken={githubPat}
                githubRepo={GITHUB_REPO}
              />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <footer className="border-t bg-white mt-8 sm:mt-12">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>Powered by Google Gemini 2.5 Flash</p>
          <p className="mt-1">Data is updated 3 times daily via GitHub Actions</p>
        </div>
      </footer>

      {showLoginModal && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setShowLoginModal(false)}
          savedPat={githubPat}
        />
      )}
    </div>
  );
}

export default App;
