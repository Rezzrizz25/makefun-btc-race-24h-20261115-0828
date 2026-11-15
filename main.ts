// Momentum-breakout bot for make.fun btc-race-24h-20261115-0828.
//
// Trades Coinbase Wrapped BTC (CBBTC) vs USDC, minute by minute, on the
// agent-fun/bars-replay/v1 protocol: the harness sends hello once, then one
// batch per minute (each batch carries the bar that just closed, the fills of
// the orders sent on the previous batch, and the account), and this bot answers
// every batch with exactly one reply echoing its seq, carrying its orders.
//
// Strategy (long only, one position, full size):
//   - Entry: the close has risen at least 1.1% over the last 15 bars AND sits
//     above its 120-bar simple moving average (a strong surge in the direction
//     of the 2-hour trend). Buy with all cash.
//   - Exit: take profit at +1.0% over the position's cost, stop loss at -0.5%
//     (a 2:1 reward-to-risk quick exit). A position that has hit neither
//     within 120 bars is sold too, rather than carried into a reversal. The
//     whole position is sold in every case.
//   - Every order caps slippage at 100 bps past the close it was decided on.
//
// Why this shape: on the 24-hour dev window BTC drifted down ~4% with 12 bps
// of 1-minute noise, so a full round trip (~26 bps of fee, slippage and pool
// impact) eats small edges. Slow EMA crosses churned and lost money in
// backtests; only selective, strong 15-minute surges above the 2-hour trend,
// exited quickly at 2:1, came out ahead (+$17.42 on the dev window in local
// replay). No randomness, no wall clock, no network: every comparison is
// bigint arithmetic on the bars' own closes, so two runs on the same data
// produce identical orders.

import { runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** Entry: 15-bar return >= 1.1%  <=>  close * 1000 >= close_15_ago * 1011. */
const MOMO_NUM = 1011n;
const MOMO_DEN = 1000n;
const MOMO_BARS = 15;
/** Trend filter: close above its 120-bar SMA  <=>  close * 120 > sum(last 120 closes). */
const SMA_BARS = 120;
/** Take profit +1.0% over cost  <=>  value * 100 >= cost * 101. */
const TP_NUM = 101n;
const TP_DEN = 100n;
/** Stop loss -0.5% under cost  <=>  value * 200 <= cost * 199. */
const SL_NUM = 199n;
const SL_DEN = 200n;
/** Slippage cap on every order, in bps past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 100;
/** Stale-position exit: sell if a position has not hit TP or SL within 120 bars. */
const TIME_EXIT_BARS = 120;

/** Closes seen so far for the symbol, as bigints at the symbol's price_scale. */
const closes: bigint[] = [];
/** Index into closes at which the current position was entered (-1 when flat). */
let entryBar = -1;

await runBars({
  onBatch(state: BarsState, batch: Batch): OrderInput[] {
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    if (held !== undefined) {
      const value = state.value(SYMBOL, held.qty);
      if (value * TP_DEN >= held.cost * TP_NUM) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      if (value * SL_DEN <= held.cost * SL_NUM) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // Stale-position exit: a surge that has not paid off within 120 bars
      // is left, rather than carried into a reversal (the window ends with a
      // forced flatten anyway). No dev-window trade held this long.
      if (entryBar >= 0 && closes.length - entryBar >= TIME_EXIT_BARS) {
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    if (closes.length <= Math.max(MOMO_BARS, SMA_BARS)) return [];
    const close = closes[closes.length - 1]!;
    if (close * MOMO_DEN < closes[closes.length - 1 - MOMO_BARS]! * MOMO_NUM) return [];
    let smaSum = 0n;
    for (let i = closes.length - SMA_BARS; i < closes.length; i++) smaSum += closes[i]!;
    if (close * BigInt(SMA_BARS) <= smaSum) return [];
    if (state.cash < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    entryBar = closes.length;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
