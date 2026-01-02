import { Config } from '../config/env';
import { Market, MarketMetrics, ScoreBreakdown } from '../types';
import { Logger } from '../utils/logger';

export class DiscordClient {
  constructor(private config: Config, private logger: Logger) {}

  async sendAlert(
    title: string,
    market: Market,
    metrics: MarketMetrics,
    score: ScoreBreakdown,
    category: string,
  ) {
    const embed = this.buildEmbed(title, market, metrics, score, category);

    if (this.config.dryRun || !this.config.discordWebhookUrl) {
      this.logger.info('DRY RUN - alert', { embed });
      return;
    }

    const res = await fetch(this.config.discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!res.ok) {
      this.logger.error('Discord webhook failed', { status: res.status, text: await res.text() });
    } else {
      this.logger.info('Alert sent to Discord', { marketId: market.id, title });
    }
  }

  private buildEmbed(
    title: string,
    market: Market,
    metrics: MarketMetrics,
    score: ScoreBreakdown,
    category: string,
  ) {
    const probability = metrics.pMarket != null ? `${(metrics.pMarket * 100).toFixed(1)}%` : 'N/D';
    const pAdjusted = metrics.pAdjusted != null ? `${(metrics.pAdjusted * 100).toFixed(1)}%` : 'N/D';
    const spread = metrics.spread != null ? metrics.spread.toFixed(4) : 'N/D';

    return {
      title: `${title} | ${category}`,
      url: market.url,
      description: market.question,
      timestamp: new Date().toISOString(),
      fields: [
        { name: 'Prob. mercado', value: probability, inline: true },
        { name: 'Prob. ajustada', value: pAdjusted, inline: true },
        { name: 'Confiança', value: metrics.confidenceLabel, inline: true },
        { name: 'Spread', value: spread, inline: true },
        { name: 'Depth bid topN', value: metrics.depthBidTop.toFixed(2), inline: true },
        { name: 'Depth ask topN', value: metrics.depthAskTop.toFixed(2), inline: true },
        { name: 'Imbalance', value: metrics.imbalance.toFixed(3), inline: true },
        { name: 'Trades/min', value: metrics.tradesPerMin.toFixed(2), inline: true },
        { name: 'Volume/min', value: metrics.volumePerMin.toFixed(2), inline: true },
        { name: 'Volume growth', value: metrics.volumeGrowth.toFixed(2), inline: true },
        { name: 'Score', value: score.finalScore.toFixed(1), inline: true },
        { name: 'Categoria', value: score.category, inline: true },
      ],
      footer: {
        text: 'Bot de leitura - sem execução de trades',
      },
      color: score.category === 'Suspeito' ? 15158332 : score.category === 'Atenção' ? 16776960 : 3066993,
    };
  }
}
