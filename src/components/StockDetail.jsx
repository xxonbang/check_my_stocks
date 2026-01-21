import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StockCard from './StockCard';

function StockDetail({ stock }) {
  if (!stock) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        종목을 선택해주세요.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <StockCard stock={stock} />
      </div>
      <div>
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-lg">AI 분석 리포트</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="markdown-content prose prose-sm max-w-none">
              <ReactMarkdown>
                {stock.ai_report || '분석 리포트가 없습니다.'}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default StockDetail;
