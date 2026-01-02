export type Market = {
  id: string;
  question: string;
  slug?: string;
  url?: string;
  createdAt?: string;
};

export type OrderBookLevel = {
  price: number;
  size: number;
};

export type OrderBookSide = OrderBookLevel[];

export type MarketOrderBook = {
  bids: OrderBookSide;
  asks: OrderBookSide;
};

export type Trade = {
  id: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  timestamp: number;
};

export type MarketMetrics = {
  pMarket: number | null;
  pAdjusted: number | null;
  confidence: number;
  confidenceLabel: 'baixa' | 'média' | 'alta';
  spread: number | null;
  depthBidTop: number;
  depthAskTop: number;
  imbalance: number;
  volatilityShort: number;
  tradesPerMin: number;
  volumePerMin: number;
  volumeGrowth: number;
};

export type ScoreBreakdown = {
  spreadScore: number;
  liquidityScore: number;
  imbalanceScore: number;
  noiseScore: number;
  activityScore: number;
  finalScore: number;
  category: 'OK' | 'Atenção' | 'Suspeito';
};
