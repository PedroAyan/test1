# Polymarket Read-only Monitor

Bot de análise (somente leitura) para Polymarket com alertas via Discord. Ele descobre novos mercados, acompanha o livro em tempo real via WebSocket, coleta trades/volume e calcula um score de "falha de odd" para destacar mercados desbalanceados.

## Requisitos
- Node.js LTS (>=18)
- npm

## Configuração (ENV)

| Variável | Descrição | Default |
| --- | --- | --- |
| `DISCORD_WEBHOOK_URL` | URL do webhook do Discord (obrigatório para envio real) | - |
| `POLYMARKET_GAMMA_BASE_URL` | Base da Gamma Markets API | `https://gamma-api.polymarket.com` |
| `POLYMARKET_CLOB_WSS_URL` | URL do WebSocket do CLOB | `wss://ws-subscriptions-clob.polymarket.com/ws/` |
| `POLYMARKET_DATA_API_BASE_URL` | Base da Data-API para trades | `https://data-api.polymarket.com` |
| `POLL_INTERVAL_SECONDS` | Intervalo de polling do discovery | `120` |
| `TOP_N_DEPTH_LEVELS` | Níveis de profundidade usados nas métricas | `10` |
| `ALERT_THRESHOLDS` | JSON string com thresholds e pesos (spread, liquidity, imbalance, noise, activity, suspectScore) | ver defaults | 
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `DRY_RUN` | Se `true`, apenas loga em vez de enviar para o Discord | `false` |
| `MAX_MONITORED_MARKETS` | Limite de mercados monitorados simultaneamente | `100` |

## Instalação
```bash
npm install
```

## Execução local
```bash
npm run build
npm start
```
Para desenvolvimento:
```bash
npm run dev
```

## Métricas e alertas
- **Discovery (Gamma)**: polling paginado, cache persistente de mercados vistos e alerta "Novo mercado".
- **Streaming (CLOB)**: assina canal `market` para L2/best bid-ask/trades com reconexão automática.
- **Trades/Volume (Data-API)**: polling leve de `/trades` com de-dup de ids.
- **Engine de métricas**: probabilidade implícita e ajustada, spread, depth top-N, imbalance, volatilidade curta, trades/min, volume/min, growth.
- **Score de falha de odd**: combinação ponderada (0-100) com categorias `OK`, `Atenção`, `Suspeito`.
- **Alertas Discord**: novo mercado, score acima do threshold, spikes de volume e resumo periódico (30m). Modo `DRY_RUN` imprime o embed no log.

## Estrutura
```
src/
  config/        # carregamento de env
  storage/       # cache persistente de mercados
  discovery/     # polling Gamma
  streaming/     # CLOB WebSocket + Data-API trades
  metrics/       # engine e score
  alerts/        # webhook do Discord
  utils/         # logger
  index.ts       # orquestração
```

## Testes
```bash
npm test
```

## Observações
- O bot é estritamente de leitura: não há execução de trades, autenticação ou uso de endpoints privados.
- Docker-friendly: processo em modo serviço sem dependência de UI.
