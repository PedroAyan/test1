import WebSocket from 'ws';
import { Config } from '../config/env';
import { Logger } from '../utils/logger';
import { MarketMetricsEngine } from '../metrics/engine';
import { MarketOrderBook, Trade } from '../types';

export type MarketUpdateHandler = (marketId: string) => void;

export class ClobClient {
  private ws?: WebSocket;
  private monitoredMarkets = new Set<string>();
  private reconnectAttempts = 0;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(
    private config: Config,
    private metrics: MarketMetricsEngine,
    private logger: Logger,
    private onMarketUpdated?: MarketUpdateHandler,
  ) {}

  start() {
    this.logger.info('Connecting to CLOB WebSocket', { url: this.config.clobWsUrl });
    this.ws = new WebSocket(this.config.clobWsUrl);

    this.ws.on('open', () => {
      this.logger.info('CLOB WebSocket connected');
      this.reconnectAttempts = 0;
      this.subscribeAll();
    });

    this.ws.on('message', (data) => this.handleMessage(data.toString()));

    this.ws.on('close', () => {
      this.logger.warn('CLOB WebSocket closed, scheduling reconnect');
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      this.logger.error('CLOB WebSocket error', { error: err.message });
      this.ws?.close();
    });
  }

  stop() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  setMarkets(marketIds: string[]) {
    this.monitoredMarkets = new Set(marketIds.slice(0, this.config.maxMonitoredMarkets));
    this.subscribeAll();
  }

  private subscribeAll() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.monitoredMarkets.forEach((marketId) => {
      this.subscribe(marketId);
    });
  }

  private subscribe(marketId: string) {
    const payload = { action: 'subscribe', channel: 'market', market: marketId };
    this.ws?.send(JSON.stringify(payload));
    this.logger.debug('Subscribed to market', { marketId });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * Math.pow(2, this.reconnectAttempts++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.start();
    }, delay);
  }

  private handleMessage(raw: string) {
    try {
      const msg = JSON.parse(raw);
      const type = msg.type || msg.event;
      if (!type) return;

      switch (type) {
        case 'l2':
        case 'book':
          this.handleOrderBook(msg);
          break;
        case 'best_bid_ask':
        case 'bb':
          this.handleBestBidAsk(msg);
          break;
        case 'trade':
          this.handleTrade(msg);
          break;
        case 'new_market':
          this.logger.info('New market from stream', { marketId: msg.marketId || msg.market_id });
          break;
        default:
          break;
      }
    } catch (error) {
      this.logger.error('Failed to parse WS message', { error: (error as Error).message });
    }
  }

  private handleOrderBook(msg: any) {
    const marketId = msg.marketId || msg.market_id;
    if (!marketId || !this.monitoredMarkets.has(marketId)) return;
    const bids: MarketOrderBook['bids'] = (msg.bids || msg.data?.bids || []).map((b: any) => ({
      price: Number(b[0] ?? b.price),
      size: Number(b[1] ?? b.size),
    }));
    const asks: MarketOrderBook['asks'] = (msg.asks || msg.data?.asks || []).map((a: any) => ({
      price: Number(a[0] ?? a.price),
      size: Number(a[1] ?? a.size),
    }));
    this.metrics.updateOrderBook(marketId, { bids, asks });
    this.onMarketUpdated?.(marketId);
  }

  private handleBestBidAsk(msg: any) {
    const marketId = msg.marketId || msg.market_id;
    if (!marketId || !this.monitoredMarkets.has(marketId)) return;
    const bids: MarketOrderBook['bids'] = msg.bestBid
      ? [{ price: Number(msg.bestBid), size: Number(msg.bestBidSize || 1) }]
      : [];
    const asks: MarketOrderBook['asks'] = msg.bestAsk
      ? [{ price: Number(msg.bestAsk), size: Number(msg.bestAskSize || 1) }]
      : [];
    this.metrics.updateOrderBook(marketId, { bids, asks });
    this.onMarketUpdated?.(marketId);
  }

  private handleTrade(msg: any) {
    const marketId = msg.marketId || msg.market_id;
    if (!marketId || !this.monitoredMarkets.has(marketId)) return;
    const trades: Trade[] = [
      {
        id: msg.id || msg.trade_id || `${msg.timestamp}-${msg.price}-${msg.size}`,
        price: Number(msg.price),
        size: Number(msg.size),
        side: msg.side === 'sell' ? 'sell' : 'buy',
        timestamp: Number(msg.timestamp || Date.now()),
      },
    ];
    this.metrics.updateTrades(marketId, trades);
    this.onMarketUpdated?.(marketId);
  }
}
