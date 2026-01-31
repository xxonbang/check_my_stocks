import React from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export const getPredictionBadge = (prediction) => {
  switch (prediction) {
    case 'Bullish':
      return <Badge variant="success" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">상승 전망</Badge>;
    case 'Bearish':
      return <Badge variant="destructive" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">하락 전망</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs sm:text-sm px-2 sm:px-3 py-0.5 sm:py-1">중립</Badge>;
  }
};

export const getPredictionIcon = (prediction) => {
  switch (prediction) {
    case 'Bullish':
      return <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-green-500" />;
    case 'Bearish':
      return <TrendingDown className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />;
    default:
      return <Minus className="w-5 h-5 sm:w-6 sm:h-6 text-gray-500" />;
  }
};
