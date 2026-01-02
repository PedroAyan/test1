import { AlertThresholds } from '../config/env';
import { MarketMetrics, ScoreBreakdown } from '../types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const computeScore = (
  metrics: MarketMetrics,
  thresholds: AlertThresholds,
): ScoreBreakdown => {
  const spreadScore = metrics.spread === null ? 0 : clamp((metrics.spread / thresholds.spread) * 100, 0, 100);

  const liquidityScore = metrics.depthBidTop + metrics.depthAskTop === 0
    ? 100
    : clamp((thresholds.liquidity / (metrics.depthBidTop + metrics.depthAskTop)) * 100, 0, 100);

  const imbalanceScore = clamp((Math.abs(metrics.imbalance) / thresholds.imbalance) * 100, 0, 100);

  const noiseScore = clamp(metrics.volatilityShort / thresholds.noise * 100, 0, 100);

  const activityScore = clamp(metrics.volumeGrowth / thresholds.activity * 100, 0, 100);

  const finalScore = clamp(
    0.25 * spreadScore +
      0.25 * liquidityScore +
      0.2 * imbalanceScore +
      0.15 * noiseScore +
      0.15 * activityScore,
    0,
    100,
  );

  let category: ScoreBreakdown['category'] = 'OK';
  if (finalScore >= thresholds.suspectScore) category = 'Suspeito';
  else if (finalScore >= 40) category = 'Atenção';

  return {
    spreadScore,
    liquidityScore,
    imbalanceScore,
    noiseScore,
    activityScore,
    finalScore,
    category,
  };
};
