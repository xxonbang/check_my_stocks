import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Clock } from 'lucide-react';

function Dashboard({ data }) {
  if (!data || !data.stocks || data.stocks.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">
            분석 데이터가 없습니다. 잠시 후 다시 확인해주세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bullishCount = data.stocks.filter(s => s.prediction === 'Bullish').length;
  const bearishCount = data.stocks.filter(s => s.prediction === 'Bearish').length;
  const neutralCount = data.stocks.filter(s => s.prediction === 'Neutral').length;

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="mb-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">포트폴리오 요약</CardTitle>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="w-4 h-4 mr-1" />
              {formatDate(data.lastUpdated)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">총 종목</p>
                <p className="text-2xl font-bold">{data.stocks.length}</p>
              </div>
            </div>
            <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
              <div>
                <p className="text-sm text-green-600">상승 전망</p>
                <p className="text-2xl font-bold text-green-600">{bullishCount}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
              <div>
                <p className="text-sm text-red-600">하락 전망</p>
                <p className="text-2xl font-bold text-red-600">{bearishCount}</p>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500" />
            </div>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm text-gray-600">중립</p>
                <p className="text-2xl font-bold text-gray-600">{neutralCount}</p>
              </div>
              <Minus className="w-8 h-8 text-gray-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default Dashboard;
