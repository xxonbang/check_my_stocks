import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart3, LogIn, LogOut, RefreshCw } from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import StockDetail from '@/components/StockDetail';
import LoginModal from '@/components/LoginModal';

const ADMIN_ID = 'xxonbang';
const ADMIN_PW = '11223344';
const GITHUB_REPO = 'xxonbang/check_my_stocks';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('isAdmin') === 'true';
  });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/analysis_results.json`);
        if (!response.ok) {
          throw new Error('Failed to load analysis data');
        }
        const jsonData = await response.json();
        setData(jsonData);
        if (jsonData.stocks && jsonData.stocks.length > 0) {
          setSelectedStock(jsonData.stocks[0]);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleLogin = (id, pw) => {
    if (id === ADMIN_ID && pw === ADMIN_PW) {
      localStorage.setItem('isAdmin', 'true');
      setIsAdmin(true);
      setShowLoginModal(false);
      return true;
    }
    return false;
  };

  const handleLogout = () => {
    localStorage.removeItem('isAdmin');
    setIsAdmin(false);
  };

  const triggerAnalysis = async () => {
    const token = prompt('GitHub Personal Access Token을 입력하세요:');
    if (!token) return;

    setIsAnalyzing(true);
    setAnalysisMessage('');

    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'manual_analysis',
          }),
        }
      );

      if (response.status === 204) {
        setAnalysisMessage('분석이 시작되었습니다.');
        setTimeout(() => setAnalysisMessage(''), 5000);
      } else {
        throw new Error(`GitHub API error: ${response.status}`);
      }
    } catch (error) {
      setAnalysisMessage(`오류: ${error.message}`);
      setTimeout(() => setAnalysisMessage(''), 5000);
    } finally {
      setIsAnalyzing(false);
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
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-8 h-8 text-primary" />
              <h1 className="text-2xl font-bold">Check My Stocks</h1>
              <span className="text-sm text-muted-foreground ml-2">AI ETF 분석</span>
            </div>
            <div className="flex items-center gap-2">
              {analysisMessage && (
                <span className={`text-sm ${analysisMessage.includes('오류') ? 'text-red-500' : 'text-green-500'}`}>
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
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${isAnalyzing ? 'animate-spin' : ''}`} />
                    {isAnalyzing ? '분석 중...' : '수동 분석'}
                  </Button>
                  <Button onClick={handleLogout} size="sm" variant="ghost">
                    <LogOut className="w-4 h-4 mr-2" />
                    로그아웃
                  </Button>
                </>
              ) : (
                <Button onClick={() => setShowLoginModal(true)} size="sm" variant="outline">
                  <LogIn className="w-4 h-4 mr-2" />
                  로그인
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            오류: {error}
          </div>
        ) : (
          <>
            <Dashboard data={data} />

            {data?.stocks && data.stocks.length > 0 && (
              <Tabs
                defaultValue={data.stocks[0]?.code}
                onValueChange={(value) => {
                  const stock = data.stocks.find(s => s.code === value);
                  setSelectedStock(stock);
                }}
              >
                <TabsList className="flex-wrap h-auto gap-1 mb-4">
                  {data.stocks.map((stock) => (
                    <TabsTrigger
                      key={stock.code}
                      value={stock.code}
                      className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
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
      </main>

      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Powered by Google Gemini 2.5 Flash</p>
          <p className="mt-1">Data is updated 3 times daily via GitHub Actions</p>
        </div>
      </footer>

      {showLoginModal && (
        <LoginModal
          onLogin={handleLogin}
          onClose={() => setShowLoginModal(false)}
        />
      )}
    </div>
  );
}

export default App;
