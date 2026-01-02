import { EventEmitter } from 'events';
import { Config } from '../config/env';
import { Market } from '../types';
import { MarketCache } from '../storage/marketCache';
import { Logger } from '../utils/logger';

export interface DiscoveryEvents {
  newMarket: (market: Market) => void;
  tick: (markets: Market[]) => void;
}

export class DiscoveryService extends EventEmitter {
  private timer?: NodeJS.Timeout;
  private pageSize = 100;

  constructor(
    private config: Config,
    private cache: MarketCache,
    private logger: Logger,
  ) {
    super();
  }

  start() {
    this.logger.info('Starting Gamma discovery');
    this.poll();
    this.timer = setInterval(() => this.poll(), this.config.pollIntervalSeconds * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(page = 1): Promise<void> {
    try {
      const url = new URL('/markets', this.config.gammaBaseUrl);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(this.pageSize));
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Gamma API responded ${response.status}`);
      const data = await response.json();
      const markets: Market[] = (data?.markets || data || []).map((m: any) => ({
        id: m.id || m.market_id || m.slug,
        question: m.question || m.title || 'Mercado sem nome',
        slug: m.slug,
        url: m.url || (m.slug ? `https://polymarket.com/market/${m.slug}` : undefined),
        createdAt: m.creation_time,
      }));

      this.emit('tick', markets);

      markets.forEach((market) => {
        if (!market.id) return;
        if (!this.cache.has(market.id)) {
          this.cache.add(market.id);
          this.logger.info('New market discovered', { marketId: market.id });
          this.emit('newMarket', market);
        }
      });

      if (markets.length === this.pageSize) {
        await this.poll(page + 1);
      }
    } catch (error) {
      this.logger.error('Discovery error', { error: (error as Error).message });
    }
  }
}
