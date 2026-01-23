import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { formatValue } from '@/lib/formatNumber';

function StockCard({ stock }) {
  const { code, name, extracted_data, prediction } = stock;

  const getPredictionBadge = () => {
    switch (prediction) {
      case 'Bullish':
        return <Badge variant="success">상승</Badge>;
      case 'Bearish':
        return <Badge variant="destructive">하락</Badge>;
      default:
        return <Badge variant="secondary">중립</Badge>;
    }
  };

  const getPredictionIcon = () => {
    switch (prediction) {
      case 'Bullish':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'Bearish':
        return <TrendingDown className="w-5 h-5 text-red-500" />;
      default:
        return <Minus className="w-5 h-5 text-gray-500" />;
    }
  };

  const isPositive = extracted_data?.changePercent?.includes('+') ||
                     (extracted_data?.changePercent && !extracted_data?.changePercent?.includes('-'));

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <p className="text-sm text-muted-foreground">{code}</p>
          </div>
          <div className="flex items-center gap-2">
            {getPredictionIcon()}
            {getPredictionBadge()}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold">
              {formatValue(extracted_data?.currentPrice)}
            </span>
            <span className={`text-sm font-medium ${isPositive ? 'text-red-500' : 'text-blue-500'}`}>
              {formatValue(extracted_data?.priceChange)} ({extracted_data?.changePercent})
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">거래량</span>
              <span className="font-medium">{formatValue(extracted_data?.volume)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">시가총액</span>
              <span className="font-medium">{formatValue(extracted_data?.marketCap)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">PER</span>
              <span className="font-medium">{formatValue(extracted_data?.per)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">PBR</span>
              <span className="font-medium">{formatValue(extracted_data?.pbr)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">52주 최고</span>
              <span className="font-medium">{formatValue(extracted_data?.high52week)}</span>
            </div>
            <div className="flex justify-between py-1 border-b">
              <span className="text-muted-foreground">52주 최저</span>
              <span className="font-medium">{formatValue(extracted_data?.low52week)}</span>
            </div>
          </div>

          {extracted_data?.foreignOwnership && (
            <div className="flex justify-between py-1 text-sm">
              <span className="text-muted-foreground">외국인 보유율</span>
              <span className="font-medium">{formatValue(extracted_data.foreignOwnership)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default StockCard;
