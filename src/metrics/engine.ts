import { MarketMetrics, MarketOrderBook, Trade } from '../types';

export type MarketState = {
  marketId: string;
  orderBook: MarketOrderBook;
  priceHistory: { price: number; timestamp: number }[];
  trades: Trade[];
  tradeIds: Set<string>;
};

export type MetricsConfig = {
  topDepthLevels: number;
};

const FIVE_MIN_MS = 5 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

export class MarketMetricsEngine {
  private state: Map<string, MarketState> = new Map();

  constructor(private config: MetricsConfig) {}

  upsertMarket(marketId: string) {
    if (!this.state.has(marketId)) {
      this.state.set(marketId, {
        marketId,
        orderBook: { bids: [], asks: [] },
        priceHistory: [],
        trades: [],
        tradeIds: new Set(),
      });
    }
  }

  updateOrderBook(marketId: string, orderBook: MarketOrderBook, timestamp = Date.now()) {
    this.upsertMarket(marketId);
    const state = this.state.get(marketId)!;
    state.orderBook = {
      bids: [...orderBook.bids].sort((a, b) => b.price - a.price).slice(0, this.config.topDepthLevels),
      asks: [...orderBook.asks].sort((a, b) => a.price - b.price).slice(0, this.config.topDepthLevels),
    };

    const bestBid = state.orderBook.bids[0]?.price;
    const bestAsk = state.orderBook.asks[0]?.price;
    const mid = this.computeMid(bestBid, bestAsk);
    if (mid !== null) {
      state.priceHistory.push({ price: mid, timestamp });
    }
    this.pruneHistory(state, timestamp);
  }

  updateTrades(marketId: string, trades: Trade[]) {
    this.upsertMarket(marketId);
    const state = this.state.get(marketId)!;
    trades.forEach((trade) => {
      if (state.tradeIds.has(trade.id)) return;
      state.tradeIds.add(trade.id);
      state.trades.push(trade);
      const bestBid = state.orderBook.bids[0]?.price;
      const bestAsk = state.orderBook.asks[0]?.price;
      const mid = this.computeMid(bestBid, bestAsk) ?? trade.price;
      state.priceHistory.push({ price: mid, timestamp: trade.timestamp });
    });
    this.pruneHistory(state, Date.now());
    this.pruneTrades(state, Date.now());
  }

  getMetrics(marketId: string): MarketMetrics {
    this.upsertMarket(marketId);
    const state = this.state.get(marketId)!;
    const now = Date.now();
    this.pruneHistory(state, now);
    this.pruneTrades(state, now);

    const bestBid = state.orderBook.bids[0]?.price ?? null;
    const bestAsk = state.orderBook.asks[0]?.price ?? null;
    const mid = this.computeMid(bestBid ?? undefined, bestAsk ?? undefined);
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

    const depthBidTop = this.sumDepth(state.orderBook.bids);
    const depthAskTop = this.sumDepth(state.orderBook.asks);
    const totalDepth = depthBidTop + depthAskTop;
    const imbalance = totalDepth === 0 ? 0 : (depthBidTop - depthAskTop) / totalDepth;

    const volatilityShort = this.computeVolatility(state.priceHistory, FIVE_MIN_MS, now);

    const { tradesPerMin, volumePerMin, volumeGrowth } = this.computeTradeStats(state.trades, now);

    const { pAdjusted, confidence, confidenceLabel } = this.computeAdjustedProb(
      mid,
      spread,
      totalDepth,
    );

    return {
      pMarket: mid,
      pAdjusted,
      confidence,
      confidenceLabel,
      spread,
      depthBidTop,
      depthAskTop,
      imbalance,
      volatilityShort,
      tradesPerMin,
      volumePerMin,
      volumeGrowth,
    };
  }

  private computeMid(bestBid?: number, bestAsk?: number): number | null {
    if (bestBid != null && bestAsk != null) return (bestBid + bestAsk) / 2;
    if (bestBid != null) return bestBid;
    if (bestAsk != null) return bestAsk;
    return null;
  }

  private sumDepth(levels: { price: number; size: number }[]) {
    return levels.reduce((acc, level) => acc + level.size, 0);
  }

  private pruneHistory(state: MarketState, now: number) {
    state.priceHistory = state.priceHistory.filter((p) => now - p.timestamp <= THIRTY_MIN_MS);
  }

  private pruneTrades(state: MarketState, now: number) {
    state.trades = state.trades.filter((t) => now - t.timestamp <= THIRTY_MIN_MS);
    const validIds = new Set(state.trades.map((t) => t.id));
    state.tradeIds = validIds;
  }

  private computeVolatility(history: { price: number; timestamp: number }[], windowMs: number, now: number) {
    const windowed = history.filter((p) => now - p.timestamp <= windowMs);
    if (windowed.length < 2) return 0;
    const mean = windowed.reduce((acc, p) => acc + p.price, 0) / windowed.length;
    const variance =
      windowed.reduce((acc, p) => acc + Math.pow(p.price - mean, 2), 0) / windowed.length;
    return Math.sqrt(variance);
  }

  private computeTradeStats(trades: Trade[], now: number) {
    const perMinute = (windowMs: number) => {
      const windowed = trades.filter((t) => now - t.timestamp <= windowMs);
      const minutes = windowMs / 60000;
      const tradeCount = windowed.length / minutes;
      const volume =
        windowed.reduce((acc, t) => acc + Math.abs(t.size * t.price), 0) / minutes;
      return { tradeCount, volume };
    };

    const last5m = perMinute(FIVE_MIN_MS);
    const last30m = perMinute(THIRTY_MIN_MS);
    const volumeGrowth = last30m.volume === 0 ? last5m.volume : last5m.volume / (last30m.volume / 6);

    return {
      tradesPerMin: last5m.tradeCount,
      volumePerMin: last5m.volume,
      volumeGrowth,
    };
  }

  private computeAdjustedProb(mid: number | null, spread: number | null, depth: number) {
    if (mid === null) {
      return { pAdjusted: null, confidence: 0, confidenceLabel: 'baixa' as const };
    }
    const spreadPenalty = spread == null ? 0.2 : Math.min(spread / 0.1, 1);
    const depthBoost = Math.min(depth / 1000, 1);
    const confidence = Math.max(0, Math.min(1, 0.2 + 0.6 * depthBoost - 0.3 * spreadPenalty));
    const adjusted = mid * (1 - spreadPenalty * 0.2) + (mid - 0.5) * 0.05 * (1 - depthBoost);

    let confidenceLabel: 'baixa' | 'média' | 'alta' = 'baixa';
    if (confidence > 0.66) confidenceLabel = 'alta';
    else if (confidence > 0.33) confidenceLabel = 'média';

    return { pAdjusted: adjusted, confidence, confidenceLabel };
  }
}
