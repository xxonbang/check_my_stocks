import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus, Cpu, ChevronRight } from 'lucide-react';
import { formatValue } from '@/lib/formatNumber';

function StockDetail({ stock }) {
  if (!stock) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        종목을 선택해주세요.
      </div>
    );
  }

  const { code, name, extracted_data, prediction, ai_report, pipeline } = stock;

  const getPredictionBadge = () => {
    switch (prediction) {
      case 'Bullish':
        return <Badge variant="success" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">상승 전망</Badge>;
      case 'Bearish':
        return <Badge variant="destructive" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">하락 전망</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">중립</Badge>;
    }
  };

  const getPredictionIcon = () => {
    switch (prediction) {
      case 'Bullish':
        return <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />;
      case 'Bearish':
        return <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />;
      default:
        return <Minus className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />;
    }
  };

  const isPositiveChange = (value) => {
    if (!value) return null;
    const str = String(value);
    if (str.includes('+') || (!str.includes('-') && !str.includes('▼'))) return true;
    if (str.includes('-') || str.includes('▼')) return false;
    return null;
  };

  const data = extracted_data || {};

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* AI 파이프라인 정보 - 상단 배너 */}
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
                <span className="hidden sm:inline text-muted-foreground">OCR:</span>
                <span className="font-medium text-purple-700">{pipeline.ocr?.replace(' API', '') || '-'}</span>
              </div>
              <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
              <div className="flex items-center gap-1 bg-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-blue-200">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                <span className="hidden sm:inline text-muted-foreground">리포트:</span>
                <span className="font-medium text-blue-700">{pipeline.report?.replace(' API', '') || '-'}</span>
              </div>
              <ChevronRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
              <div className="flex items-center gap-1 bg-white px-1.5 sm:px-2.5 py-1 sm:py-1.5 rounded-md border border-green-200">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="hidden sm:inline text-muted-foreground">예측:</span>
                <span className="font-medium text-green-700">{pipeline.prediction?.replace(' API', '') || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메인 컨텐츠 - 2컬럼 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* 좌측: 모든 지표 표시 */}
        <div className="space-y-3 sm:space-y-4">
          {/* 가격 정보 카드 */}
          <Card>
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="text-lg sm:text-xl truncate">{name}</CardTitle>
                <p className="text-xs sm:text-sm text-muted-foreground">{code}</p>
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                {getPredictionIcon()}
                {getPredictionBadge()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="mb-3 sm:mb-4">
              <div className="flex flex-wrap items-baseline gap-1 sm:gap-3">
                <span className="text-2xl sm:text-3xl font-bold">{formatValue(data.currentPrice)}원</span>
                <span className={`text-sm sm:text-lg font-medium ${isPositiveChange(data.changePercent) ? 'text-red-500' : 'text-blue-500'}`}>
                  {formatValue(data.priceChange)} ({formatValue(data.changePercent)})
                </span>
              </div>
            </div>

            {/* 가격 정보 */}
            <div className="mb-3 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">가격 정보</h4>
              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">전일</p>
                  <p className="font-medium truncate">{formatValue(data.prevClose)}</p>
                </div>
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">시가</p>
                  <p className="font-medium truncate">{formatValue(data.openPrice)}</p>
                </div>
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">고가</p>
                  <p className="font-medium text-red-500 truncate">{formatValue(data.highPrice)}</p>
                </div>
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">저가</p>
                  <p className="font-medium text-blue-500 truncate">{formatValue(data.lowPrice)}</p>
                </div>
              </div>
            </div>

            {/* 52주 정보 */}
            <div className="mb-3 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">52주 범위</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <div className="bg-red-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">52주 최고</p>
                  <p className="font-medium text-red-600">{formatValue(data.high52week)}</p>
                </div>
                <div className="bg-blue-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">52주 최저</p>
                  <p className="font-medium text-blue-600">{formatValue(data.low52week)}</p>
                </div>
              </div>
            </div>

            {/* 거래 정보 */}
            <div className="mb-3 sm:mb-4">
              <h4 className="text-xs sm:text-sm font-semibold text-muted-foreground mb-2">거래 정보</h4>
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm">
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">거래량</p>
                  <p className="font-medium">{formatValue(data.volume)}</p>
                </div>
                <div className="bg-slate-50 p-1.5 sm:p-2 rounded">
                  <p className="text-muted-foreground text-xs">거래대금</p>
                  <p className="font-medium">{formatValue(data.tradingValue)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ETF 지표 카드 */}
        <Card>
          <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
            <CardTitle className="text-base sm:text-lg">ETF 핵심 지표</CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-6 pb-3 sm:pb-6">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">iNAV</span>
                <span className="font-medium">{formatValue(data.inav)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">NAV</span>
                <span className="font-medium">{formatValue(data.nav)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">괴리율</span>
                <span className={`font-medium ${String(data.premiumDiscount).includes('-') ? 'text-blue-500' : 'text-red-500'}`}>
                  {formatValue(data.premiumDiscount)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">시가총액</span>
                <span className="font-medium">{formatValue(data.marketCap)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">운용자산</span>
                <span className="font-medium">{formatValue(data.aum)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-muted-foreground">총보수</span>
                <span className="font-medium">{formatValue(data.expenseRatio)}</span>
              </div>
              <div className="flex justify-between py-2 border-b col-span-2">
                <span className="text-muted-foreground">배당수익률</span>
                <span className="font-medium">{formatValue(data.dividendYield)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 수익률 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">수익률</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2">
              <div className={`p-3 rounded text-center ${isPositiveChange(data.return1m) ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-muted-foreground mb-1">1개월</p>
                <p className={`font-bold ${isPositiveChange(data.return1m) ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatValue(data.return1m)}
                </p>
              </div>
              <div className={`p-3 rounded text-center ${isPositiveChange(data.return3m) ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-muted-foreground mb-1">3개월</p>
                <p className={`font-bold ${isPositiveChange(data.return3m) ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatValue(data.return3m)}
                </p>
              </div>
              <div className={`p-3 rounded text-center ${isPositiveChange(data.return1y) ? 'bg-red-50' : 'bg-blue-50'}`}>
                <p className="text-xs text-muted-foreground mb-1">1년</p>
                <p className={`font-bold ${isPositiveChange(data.return1y) ? 'text-red-600' : 'text-blue-600'}`}>
                  {formatValue(data.return1y)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 투자자별 매매동향 카드 */}
        {data.investorTrend && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">투자자별 매매동향</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-3 rounded text-center ${isPositiveChange(data.investorTrend.individual) ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <p className="text-xs text-muted-foreground mb-1">개인</p>
                  <p className={`font-bold text-sm ${isPositiveChange(data.investorTrend.individual) ? 'text-red-600' : 'text-blue-600'}`}>
                    {formatValue(data.investorTrend.individual)}
                  </p>
                </div>
                <div className={`p-3 rounded text-center ${isPositiveChange(data.investorTrend.foreign) ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <p className="text-xs text-muted-foreground mb-1">외국인</p>
                  <p className={`font-bold text-sm ${isPositiveChange(data.investorTrend.foreign) ? 'text-red-600' : 'text-blue-600'}`}>
                    {formatValue(data.investorTrend.foreign)}
                  </p>
                </div>
                <div className={`p-3 rounded text-center ${isPositiveChange(data.investorTrend.institution) ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <p className="text-xs text-muted-foreground mb-1">기관</p>
                  <p className={`font-bold text-sm ${isPositiveChange(data.investorTrend.institution) ? 'text-red-600' : 'text-blue-600'}`}>
                    {formatValue(data.investorTrend.institution)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 차트 분석 지표 카드 */}
        {data.chartAnalysis && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">차트 기술적 지표</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                {data.chartAnalysis.trend && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">추세</span>
                    <span className={`font-medium ${data.chartAnalysis.trend === '상승' ? 'text-red-500' : data.chartAnalysis.trend === '하락' ? 'text-blue-500' : ''}`}>
                      {data.chartAnalysis.trend}
                    </span>
                  </div>
                )}
                {data.chartAnalysis.ma5 && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">5일 이평선</span>
                    <span className="font-medium">{formatValue(data.chartAnalysis.ma5)}</span>
                  </div>
                )}
                {data.chartAnalysis.ma20 && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">20일 이평선</span>
                    <span className="font-medium">{formatValue(data.chartAnalysis.ma20)}</span>
                  </div>
                )}
                {data.chartAnalysis.ma60 && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">60일 이평선</span>
                    <span className="font-medium">{formatValue(data.chartAnalysis.ma60)}</span>
                  </div>
                )}
                {data.chartAnalysis.support && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">지지선</span>
                    <span className="font-medium text-blue-500">{formatValue(data.chartAnalysis.support)}</span>
                  </div>
                )}
                {data.chartAnalysis.resistance && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">저항선</span>
                    <span className="font-medium text-red-500">{formatValue(data.chartAnalysis.resistance)}</span>
                  </div>
                )}
                {data.chartAnalysis.pattern && (
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-muted-foreground">패턴</span>
                    <span className="font-medium">{data.chartAnalysis.pattern}</span>
                  </div>
                )}
                {data.chartAnalysis.signal && (
                  <div className="flex justify-between py-2">
                    <span className="text-muted-foreground">시그널</span>
                    <Badge variant={data.chartAnalysis.signal === '매수' ? 'success' : data.chartAnalysis.signal === '매도' ? 'destructive' : 'secondary'}>
                      {data.chartAnalysis.signal}
                    </Badge>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        </div>

        {/* 우측: AI 분석 리포트 */}
        <div>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="text-lg">AI 분석 리포트</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="markdown-content prose prose-sm max-w-none">
                <ReactMarkdown>
                  {ai_report || '분석 리포트가 없습니다.'}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default StockDetail;
