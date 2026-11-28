# Signal engine v2

Independent strategy modules combined with **OR**, confluence grading, strict anti-late rules and
early-warning WATCH signals. It runs next to the old pipelines (`/api/signals/run`), which are untouched.

```
cron-job.org (every 1 min) ─▶ POST /api/engine/run ─▶ runner.ts
  universe (24h vol > $20M, top 40) ─▶ data/live.ts (REST; 4H/1H/15m/OI cached until next close)
  for each symbol: regime.ts ─▶ strategies allowed for the regime ─▶ factors.ts (+confidence)
  pipeline.decide: cooldown ─▶ R:R + cost ─▶ conflict ─▶ confluence A/B/C ─▶ anti-late ─▶ hourly cap
  book.applyDecisions ─▶ MongoDB (EngineSignal) + Telegram
  lifecycle.advanceLifecycle on 5m candles ─▶ TP1/TP2/SL/BE/EXPIRED/INVALIDATED replies
```

The backtest (`npm run backtest:engine`) calls the same `evaluateSymbol → decide → applyDecisions →
advanceLifecycle`. Only the data provider differs. It feeds closed candles only (closeTime < t), so
it cannot look ahead.

| File | Role |
|---|---|
| `config.ts` | **every** threshold (explained below) |
| `types.ts` | `Signal`, `MarketData`, `Strategy` interface: `evaluate(symbol, input) → Signal \| null` |
| `strategies/*.ts` | 5 modules, ≤ 4 core AND conditions each |
| `regime.ts`, `indicators.ts`, `factors.ts` | regime, shared indicators, supporting factors |
| `pipeline.ts`, `book.ts` | decisions + recent-signal state (pure, shared live/backtest) |
| `lifecycle.ts` | fill / TP / SL / BE / expiry / invalidation / timeout, MFE/MAE |
| `runner.ts` | live IO (Binance, Mongo, Telegram) |
| `stats.ts`, `service.ts` | per-strategy stats (website + backtest) |

## Running

| What | How |
|---|---|
| Live | cron-job.org → `POST https://<site>/api/engine/run` every **1 min**, header `Authorization: Bearer <CRON_SECRET>`. Keep the old 5-min job on `/api/signals/run`. |
| Telegram | `ENGINE_TELEGRAM_ENABLED=true` (default **false**: signals are only saved and tracked on `/engine`). |
| Kill switch | `ENGINE_SIGNALS_ENABLED=false` makes `/api/engine/run` a no-op. |
| Backtest | `npm run backtest:engine [-- --days 180 --symbols BTCUSDT,ETHUSDT --csv]` |
| Website | `/engine`: per-strategy, per-regime and per-grade tables plus recent signals. |

Turn a strategy off with `strategies.<name>.enabled = false`. Change which strategies run in which
regime with `routing`.

## Config reference

Units: **%** = percent (2 = 2%), **frac** = fraction (0.0005 = 0.05%), **ATR** = multiple of the named ATR, **bars** = closed candles.

### universe / history
| Key | Default | Meaning |
|---|---|---|
| `universe.minQuoteVolumeUsd` | 20 000 000 | Skip symbols below this 24h USD volume (manipulated low caps). |
| `universe.maxSymbols` | 40 | Top-N by volume per run. ~7 Binance weight per symbol per new candle. |
| `universe.exclude` | stables | Never scanned. |
| `universe.fetchConcurrency` | 6 | Parallel symbol downloads per run. |
| `history.4h/1h/15m/5m` | 260/260/220/60 | Candles loaded. Must cover EMA200 warm-up (4H/1H) and the 100-bar BB rank (15m). |
| `history.oiPoints` | 100 | 15m OI points (25h). |

### regime (4H, per symbol)
| Key | Default | Meaning |
|---|---|---|
| `regime.adxPeriod` / `adxTrend` | 14 / 20 | ADX above `adxTrend` + EMA alignment → TREND, else RANGE. |
| `regime.emaFast` / `emaSlow` | 50 / 200 | Alignment: fast > slow and close > fast (or mirror). |
| `regime.atrPeriod` / `atrAvgPeriod` | 14 / 50 | ATR and the window of its average. |
| `regime.highVolAtrMult` | 1.8 | ATR > 1.8 × average → HIGH_VOL (overrides). |
| `routing.TREND/RANGE/HIGH_VOL` | spec §4 | Strategies allowed per regime. |
| `highVolStopMult` | 1.3 | HIGH_VOL stop distance × this. TPs scale too, so R multiples stay the same. |

### strategies.trend_pullback
| Key | Default | Meaning |
|---|---|---|
| `adxMin` | 20 | 4H ADX floor for the trend context. |
| `emaBandFast` / `emaBandSlow` | 20 / 50 | 1H EMA band the pullback must reach. EMA50 is also the invalidation. |
| `fibLow` / `fibHigh` | 0.382 / 0.618 | Alternative zone: retracement of the last 1H impulse. |
| `swingPivot1h` | 3 | Bars each side for 1H swings (impulse, TP1 target). |
| `zoneLookback1h` | 4 | Zone touch must be within the last 4 closed 1H bars. |
| `swingPivot15m` / `triggerSwingMaxAge` | 2 / 24 | 15m lower-high detection and its max age for the break trigger. |
| `slAtr` | 0.5 | SL = zone far edge − 0.5 × ATR(1H). |
| `tp2R` / `tp1FallbackR` | 2 / 1 | TP2 in R. TP1 = previous swing high, or 1R if none lies between 0.5R and TP2. |
| `baseConfidence` | 55 | Starting confidence (+ADX strength, +5 when engulfing and break agree). |

### strategies.pre_pump
| Key | Default | Meaning |
|---|---|---|
| `bbPeriod` / `bbStd` | 20 / 2 | Bollinger bands on 15m. |
| `bbSqueezePct` / `bbRankWindow` | 10 / 100 | Squeeze = bandwidth in the lowest 10% of the last 100 bars. |
| `squeezeRecentBars` | 4 | Squeeze may be up to 4 bars old (the volume surge itself widens the bands). |
| `volBars` / `volMult` / `volAvgPeriod` | 3 / 2.5 / 20 | Last 3 bars' average volume > 2.5 × the prior 20-bar average. |
| `oiRisePct` / `oiWindowHours` / `flatPricePct` | 8 / 4 / 2 | OI +8% in 4h while price moved ≤ ±2%. |
| `btcMaxAdverse1hPct` | 1.5 | BTC's last 1h move against the bias must be < 1.5% (mirrored for short bias). |
| `minConditions` | 3 | Conditions (of 4) required for WATCH. |
| `rangeBars` | 16 | Watched range = last 16 × 15m (4h). |
| `breakoutVolMult` | 2 | WATCH → ENTRY: close beyond range with volume > 2 × average. |
| `watchValidBars` | 24 | WATCH lifetime (6h) for the upgrade. |
| `slAtr` / `tp1RangeMult` / `tp2RangeMult` | 0.25 / 1 / 2 | SL at range mid ∓ 0.25 ATR. TPs = 1× / 2× range height. |
| `baseConfidence` / `watchConfidence` | 50 / 40 | Starting confidence for ENTRY / WATCH. |

### strategies.funding_squeeze
| Key | Default | Meaning |
|---|---|---|
| `longFundingMax` | −0.0005 frac | Funding < −0.05% → short-squeeze long setup. |
| `shortFundingMin` | 0.0008 frac | Funding > +0.08% → long-squeeze short setup. |
| `oiRisePct` / `oiWindowHours` | 2 / 4 | Long: OI rose ≥ 2% in 4h. |
| `oiLocalHighFrac` | 0.98 | Short: OI ≥ 98% of its 24h max. |
| `recentBars` / `priorBars` | 8 / 32 | "No new low/high": last 8 bars did not exceed the extreme of the 32 before. |
| `swingPivot15m` / `triggerSwingMaxAge` | 2 / 24 | 15m structure-break trigger. |
| `slAtr` / `tp1R` / `tp2R` | 0.3 / 1.2 / 2.5 | SL beyond the last opposite swing; TPs in R. |
| `cvdBonus` / `cvdBars` | 8 / 16 | +8 confidence when CVD falls over 16 bars into a short. |

### strategies.liquidity_sweep
| Key | Default | Meaning |
|---|---|---|
| `equalMinTouches` / `equalTolAtr` / `equalLookback1h` | 2 / 0.15 / 72 | Equal highs/lows = ≥ 2 1H swings within 0.15 ATR, last 72h. |
| `swingPivot1h` | 3 | 1H swing strength for equal levels. |
| `volMult` / `volAvgPeriod` | 1.5 / 20 | Sweep candle volume > 1.5 × average. |
| `slAtr` | 0.1 | SL = wick tip ± 0.1 ATR(15m). |
| `entryZoneAtr` | 0.3 | Limit zone from the confirmation close back toward the level. |
| `weeklyBonus` | 8 | Extra confidence for PWH/PWL sweeps. |

### strategies.breakout_retest
| Key | Default | Meaning |
|---|---|---|
| `rangeBars` / `maxRangeAtr` | 20 / 3 | Range = 20 bars before the breakout, height < 3 ATR. |
| `volMult` / `volAvgPeriod` | 2 / 20 | Breakout candle volume > 2 × average. |
| `retestMaxBars` / `retestTolAtr` | 8 / 0.15 | First touch of the level within 8 bars, ±0.15 ATR. |
| `slAtr` / `entryZoneAtr` | 0.6 / 0.3 | SL beyond the level. Zone = level → level ± 0.3 ATR. |
| `tp1RangeMult` / `tp2RangeMult` | 1 / 2 | Measured move: 1× / 2× range height. |

### shared
| Key | Default | Meaning |
|---|---|---|
| `entryZoneAtr` | 0.3 | Limit zone for trigger-candle strategies: close → close ∓ 0.3 ATR(15m). |
| `factors.*` | 5/5/5/3 pts | Supporting factors (RSI divergence, CVD divergence, RS vs BTC over 4h, VWAP side). Points only, never standalone. |
| `confluence.windowMin` | 30 | Same symbol + direction within 30 min → one message. A later joiner sends an "upgrade" reply. |
| `confluence.extraStrategyPts` | 10 | Confidence per extra agreeing strategy. |
| `confluence.gradeB` / `gradeA` | 2 / 3 | Strategies needed for grade B / A. |
| `antiLate.maxChaseAtr` | 0.8 | Price > 0.8 ATR(15m) past the zone → MISSED. Retried each minute until expiry: sent if price returns. |
| `antiLate.expiryMin` | 45 | Unfilled limit zone expires (3 × 15m) → "EXPIRED" reply. |
| `antiLate.minRR` | 1.8 | Minimum R:R from zone midpoint to TP2. |
| `antiLate.maxCostR` | 0.25 | Skip if fees+slippage > 0.25R (stop too tight for the edge to survive costs). |
| `cooldown.sameSetupHours` | 4 | Same symbol + strategy + direction silenced for 4h. |
| `cooldown.maxPerHour` | 10 | Messages per rolling hour. Highest grade wins, ENTRY before WATCH. |
| `lifecycle.tp1ClosePct` / `beOffsetR` | 0.5 / 0.1 | 50% closed at TP1, stop → entry + 0.1R. |
| `lifecycle.maxHoldHours` | 48 | Filled trades still open after 48h are closed at market ("timeout"). |
| `lifecycle.maxUpdatesPerRun` | 40 | Active signals updated per run (Binance load). |
| `backtest.days` / `roundTripCostPct` | 180 / 0.12 | Backtest window and round-trip cost (also used by `maxCostR` and `netR` live). |

## Data notes
- OI: live = `/futures/data/openInterestHist` (15m). Backtest = data.binance.vision daily `metrics`
  archive (5m), because the REST endpoint keeps only 30 days.
- Funding: live = current `lastFundingRate`. Backtest = last settled rate at t. These are close but not identical.
- Live runs at minute resolution while triggers use closed 15m candles. The extra live benefit is
  the anti-late check on the real current price.

## ML
Every `EngineSignal` row stores `features` (flat map of ~40 values at signal time: regime, ADX,
ATR ratio, funding, OI changes, volume ratios, RSI, BB percentile, strategy flags, per-strategy
factors) plus labels (`status`, `netR`, `mfeR`, `maeR`, `hitTp1`). `npm run backtest:engine -- --csv`
writes the same columns for history. Train a model (e.g. XGBoost) on `hitTp1` / `netR > 0`. Use its
probability to re-weight `confidence` or as a gate.
