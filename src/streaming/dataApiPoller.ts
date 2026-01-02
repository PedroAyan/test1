import { Config } from '../config/env';
import { Logger } from '../utils/logger';
import { MarketMetricsEngine } from '../metrics/engine';
import { Trade } from '../types';

export class DataApiPoller {
  private timer?: NodeJS.Timeout;

  constructor(
    private config: Config,
    private metrics: MarketMetricsEngine,
    private logger: Logger,
  ) {}

  start(getMarketIds: () => string[]) {
    this.logger.info('Starting Data-API poller');
    const run = () => this.poll(getMarketIds());
    run();
    this.timer = setInterval(run, Math.max(60, this.config.pollIntervalSeconds) * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(marketIds: string[]) {
    const limited = marketIds.slice(0, this.config.maxMonitoredMarkets);
    for (const marketId of limited) {
      try {
        const url = new URL('/trades', this.config.dataApiBaseUrl);
        url.searchParams.set('market', marketId);
        url.searchParams.set('limit', '200');
        const res = await fetch(url.toString());
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();
        const trades: Trade[] = (data?.data || data || []).map((t: any) => ({
          id: t.id || `${t.transaction_hash}-${t.price}-${t.size}`,
          price: Number(t.price),
          size: Number(t.size || t.amount),
          side: t.side === 'sell' ? 'sell' : 'buy',
          timestamp: Number(t.timestamp || t.time || Date.now()),
        }));
        this.metrics.updateTrades(marketId, trades);
        this.logger.debug('Trades updated', { marketId, count: trades.length });
      } catch (error) {
        this.logger.warn('Trade poll failed', { marketId, error: (error as Error).message });
      }
    }
  }
}
