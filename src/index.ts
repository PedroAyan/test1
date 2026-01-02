import { loadConfig } from './config/env';
import { Logger } from './utils/logger';
import { MarketCache } from './storage/marketCache';
import { DiscoveryService } from './discovery/discoveryService';
import { MarketMetricsEngine } from './metrics/engine';
import { ClobClient } from './streaming/clobClient';
import { DataApiPoller } from './streaming/dataApiPoller';
import { DiscordClient } from './alerts/discordClient';
import { computeScore } from './metrics/score';
import { Market } from './types';

const config = loadConfig();
const logger = new Logger(config.logLevel as any);
const cache = new MarketCache();
const metricsEngine = new MarketMetricsEngine({ topDepthLevels: config.topDepthLevels });
const discord = new DiscordClient(config, logger);

const markets = new Map<string, Market>();
const lastScoreSent = new Map<string, number>();
const lastVolumeAlert = new Map<string, number>();

const discovery = new DiscoveryService(config, cache, logger);
const clob = new ClobClient(config, metricsEngine, logger, (marketId) => evaluateMarket(marketId));
const dataPoller = new DataApiPoller(config, metricsEngine, logger);

discovery.on('newMarket', (market: Market) => {
  markets.set(market.id, market);
  clob.setMarkets(Array.from(markets.keys()));
  discord.sendAlert(
    'Novo mercado detectado',
    market,
    metricsEngine.getMetrics(market.id),
    computeScore(metricsEngine.getMetrics(market.id), config.alertThresholds),
    'Novo',
  );
});

discovery.on('tick', (items: Market[]) => {
  items.forEach((m) => markets.set(m.id, m));
  clob.setMarkets(Array.from(markets.keys()));
});

function evaluateMarket(marketId: string) {
  const market = markets.get(marketId);
  if (!market) return;
  const metrics = metricsEngine.getMetrics(marketId);
  const score = computeScore(metrics, config.alertThresholds);
  const now = Date.now();

  if (score.finalScore >= config.alertThresholds.suspectScore) {
    const last = lastScoreSent.get(marketId) || 0;
    if (now - last > 15 * 60 * 1000) {
      lastScoreSent.set(marketId, now);
      discord.sendAlert('Falha de odd detectada', market, metrics, score, score.category);
    }
  }

  if (metrics.volumeGrowth >= 2 && metrics.tradesPerMin > 0) {
    const last = lastVolumeAlert.get(marketId) || 0;
    if (now - last > 10 * 60 * 1000) {
      lastVolumeAlert.set(marketId, now);
      discord.sendAlert('Spike de volume', market, metrics, score, 'Atividade');
    }
  }
}

function sendSummary() {
  const scored = Array.from(markets.keys()).map((id) => {
    const metrics = metricsEngine.getMetrics(id);
    const score = computeScore(metrics, config.alertThresholds);
    return { id, metrics, score };
  });
  const suspects = scored
    .sort((a, b) => b.score.finalScore - a.score.finalScore)
    .slice(0, 10)
    .filter((s) => s.score.finalScore >= 40);
  const active = scored
    .sort((a, b) => b.metrics.volumePerMin - a.metrics.volumePerMin)
    .slice(0, 10);

  const topSuspects = suspects
    .map((s, idx) => `${idx + 1}. ${markets.get(s.id)?.question ?? s.id} (${s.score.finalScore.toFixed(1)})`)
    .join('\n');
  const topActive = active
    .map((s, idx) => `${idx + 1}. ${markets.get(s.id)?.question ?? s.id} (${s.metrics.volumePerMin.toFixed(2)}/min)`) 
    .join('\n');

  const summaryMarket: Market = {
    id: 'summary',
    question: `Top suspeitos:\n${topSuspects || 'Nenhum'}\n\nTop ativos:\n${topActive || 'Nenhum'}`,
    url: undefined,
  };

  const metrics = {
    pMarket: null,
    pAdjusted: null,
    confidence: 1,
    confidenceLabel: 'alta' as const,
    spread: null,
    depthBidTop: 0,
    depthAskTop: 0,
    imbalance: 0,
    volatilityShort: 0,
    tradesPerMin: 0,
    volumePerMin: 0,
    volumeGrowth: 0,
  };

  const score = {
    spreadScore: 0,
    liquidityScore: 0,
    imbalanceScore: 0,
    noiseScore: 0,
    activityScore: 0,
    finalScore: suspects[0]?.score.finalScore ?? 0,
    category: 'OK' as const,
  };

  discord.sendAlert(
    'Resumo 30m',
    summaryMarket,
    metrics,
    score,
    'Resumo',
  );

  if (config.dryRun || !config.discordWebhookUrl) {
    logger.info('Top suspeitos', { list: topSuspects });
    logger.info('Top ativos', { list: topActive });
  }
}

function main() {
  logger.info('Inicializando bot Polymarket');
  discovery.start();
  clob.start();
  dataPoller.start(() => Array.from(markets.keys()));
  setInterval(sendSummary, 30 * 60 * 1000);
}

main();
