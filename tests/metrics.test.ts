import { describe, expect, it } from 'vitest';
import { MarketMetricsEngine } from '../src/metrics/engine';
import { computeScore } from '../src/metrics/score';
import { AlertThresholds } from '../src/config/env';

const thresholds: AlertThresholds = {
  spread: 0.05,
  liquidity: 500,
  imbalance: 0.35,
  noise: 0.25,
  activity: 0.3,
  suspectScore: 70,
};

describe('MarketMetricsEngine', () => {
  it('computes mid price, spread and imbalance', () => {
    const engine = new MarketMetricsEngine({ topDepthLevels: 3 });
    engine.updateOrderBook('m1', {
      bids: [
        { price: 0.45, size: 100 },
        { price: 0.44, size: 50 },
      ],
      asks: [
        { price: 0.55, size: 100 },
        { price: 0.56, size: 50 },
      ],
    }, Date.now());

    const metrics = engine.getMetrics('m1');
    expect(metrics.pMarket).toBeCloseTo(0.5);
    expect(metrics.spread).toBeCloseTo(0.1);
    expect(metrics.imbalance).toBeCloseTo(0);
  });

  it('deduplicates trades and computes volume/trades per minute', () => {
    const engine = new MarketMetricsEngine({ topDepthLevels: 5 });
    const now = Date.now();
    engine.updateTrades('m2', [
      { id: 't1', price: 0.6, size: 50, side: 'buy', timestamp: now },
      { id: 't1', price: 0.6, size: 50, side: 'buy', timestamp: now },
      { id: 't2', price: 0.62, size: 25, side: 'sell', timestamp: now },
    ]);

    const metrics = engine.getMetrics('m2');
    expect(metrics.tradesPerMin).toBeGreaterThan(0);
    expect(metrics.volumePerMin).toBeGreaterThan(0);
    expect(metrics.tradesPerMin).toBeLessThan(5);
  });
});

describe('computeScore', () => {
  it('classifies suspect markets with high spread and low liquidity', () => {
    const metrics = {
      pMarket: 0.5,
      pAdjusted: 0.48,
      confidence: 0.3,
      confidenceLabel: 'baixa' as const,
      spread: 0.2,
      depthBidTop: 50,
      depthAskTop: 60,
      imbalance: 0.25,
      volatilityShort: 0.3,
      tradesPerMin: 1,
      volumePerMin: 10,
      volumeGrowth: 1,
    };

    const score = computeScore(metrics, thresholds);
    expect(score.finalScore).toBeGreaterThanOrEqual(thresholds.suspectScore);
    expect(score.category).toBe('Suspeito');
  });
});
