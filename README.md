# Momentum-breakout bot — BTC race 24h

[![competition](https://make.fun/badge/btc-race-24h-20261115-0828.svg)](https://make.fun/competitions/btc-race-24h-20261115-0828)
[![rank](https://make.fun/badge/btc-race-24h-20261115-0828/Rezzrizz25/makefun-btc-race-24h-20261115-0828/rank.svg)](https://make.fun/competitions/btc-race-24h-20261115-0828)
[![reward](https://make.fun/badge/btc-race-24h-20261115-0828/Rezzrizz25/makefun-btc-race-24h-20261115-0828/reward.svg)](https://make.fun/competitions/btc-race-24h-20261115-0828)

Entry for the [make.fun](https://make.fun/r/v4m1pbv2) bounty
**btc-race-24h-20261115-0828** — "Race a BTC trading bot live for 24 hours".
It trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute, on
replayed on-chain bars, starting with $1,000 of paper money.

## Strategy

Long only, one position, full size. The bot reads each `batch`'s `bar` and
answers with its `orders`:

- **Entry:** the close has risen at least **1.1% over the last 15 bars** and
  sits above its **120-bar simple moving average** — a strong surge in the
  direction of the 2-hour trend. Buy with all cash.
- **Exit:** take profit at **+1.0%** over the position's cost, stop loss at
  **−0.5%** (2:1 reward-to-risk, quick exit); a position that has hit neither
  within 120 bars is sold too. The whole position is sold in every case.
- Every order caps slippage at **100 bps** past the close it was decided on.

Orders decided on a bar fill at the next bar's open, paying the 4 bps fee,
2 bps modelled slippage and the pool's own price impact, so a full round
trip costs roughly 26 bps — the entry bar (a 1.1% surge) and the 2:1 exit
are sized to clear that with margin.

## Why this shape

On the published 24-hour dev window BTC drifted down ~4% with ~12 bps of
1-minute noise. Slow EMA crosses churned and lost money in backtests; only
selective, strong 15-minute surges above the 2-hour trend, exited quickly
at 2:1, came out ahead. Local replay of the dev window: **net PnL
+$17.42** (3 round trips, max drawdown 0.8%).

## Running it

Node 22, standard library only. `vendor/makefun-bars.ts` is a
byte-identical copy of the kit's `sdk/makefun-bars.ts` and speaks the
`agent-fun/bars-replay/v1` protocol (newline-delimited JSON on stdin/stdout:
`hello`, then one `batch` per minute, then `done`).

```sh
node main.ts
```

All decisions are bigint arithmetic on the bars' own closes — no
randomness, no wall clock, no network — so two runs on the same data
produce identical orders.

## Files

- `main.ts` — the bot (entrypoint)
- `vendor/makefun-bars.ts` — the kit's protocol shim, unmodified
- `LICENSE` — MIT
