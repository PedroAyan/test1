import dotenv from 'dotenv';

dotenv.config();

export type AlertThresholds = {
  spread: number;
  liquidity: number;
  imbalance: number;
  noise: number;
  activity: number;
  suspectScore: number;
};

export type Config = {
  discordWebhookUrl: string;
  gammaBaseUrl: string;
  clobWsUrl: string;
  dataApiBaseUrl: string;
  pollIntervalSeconds: number;
  topDepthLevels: number;
  alertThresholds: AlertThresholds;
  logLevel: string;
  dryRun: boolean;
  maxMonitoredMarkets: number;
};

const parseAlertThresholds = (raw: string | undefined): AlertThresholds => {
  const defaults: AlertThresholds = {
    spread: 0.05,
    liquidity: 500,
    imbalance: 0.35,
    noise: 0.25,
    activity: 0.3,
    suspectScore: 70,
  };

  if (!raw) return defaults;

  try {
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (error) {
    console.warn('Failed to parse ALERT_THRESHOLDS, using defaults', error);
    return defaults;
  }
};

export const loadConfig = (): Config => {
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL || '';
  if (!discordWebhookUrl) {
    console.warn('DISCORD_WEBHOOK_URL is not set; alerts will only be logged');
  }

  return {
    discordWebhookUrl,
    gammaBaseUrl:
      process.env.POLYMARKET_GAMMA_BASE_URL || 'https://gamma-api.polymarket.com',
    clobWsUrl:
      process.env.POLYMARKET_CLOB_WSS_URL ||
      'wss://ws-subscriptions-clob.polymarket.com/ws/',
    dataApiBaseUrl:
      process.env.POLYMARKET_DATA_API_BASE_URL || 'https://data-api.polymarket.com',
    pollIntervalSeconds: Number(process.env.POLL_INTERVAL_SECONDS || 120),
    topDepthLevels: Number(process.env.TOP_N_DEPTH_LEVELS || 10),
    alertThresholds: parseAlertThresholds(process.env.ALERT_THRESHOLDS),
    logLevel: process.env.LOG_LEVEL || 'info',
    dryRun: process.env.DRY_RUN === 'true',
    maxMonitoredMarkets: Number(process.env.MAX_MONITORED_MARKETS || 100),
  };
};
