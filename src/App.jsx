import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3 } from 'lucide-react';
import Dashboard from '@/components/Dashboard';
import StockDetail from '@/components/StockDetail';
import AdminPanel from '@/components/AdminPanel';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);

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
          <div className="flex items-center gap-2">
            <BarChart3 className="w-8 h-8 text-primary" />
            <h1 className="text-2xl font-bold">Check My Stocks</h1>
            <span className="text-sm text-muted-foreground ml-2">AI 주식 분석</span>
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

            <AdminPanel />
          </>
        )}
      </main>

      <footer className="border-t bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Powered by Google Gemini 1.5 Flash</p>
          <p className="mt-1">Data is updated 3 times daily via GitHub Actions</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
