/**
 * Signal engine v2 — the ONLY place for thresholds and parameters.
 *
 * Every number used by the regime detector, the 5 strategies, confluence grading,
 * the anti-late filter, cooldowns and the lifecycle lives here. Strategy code must
 * read from `cfg` and never hardcode a threshold. Units are noted on every field:
 *   - "%"      → plain percent (2 = 2%)
 *   - "frac"   → fraction (0.0005 = 0.05%) — used for funding, matching Binance's API
 *   - "ATR"    → multiple of the ATR named in the comment
 *   - "bars"   → closed candles of the timeframe named in the comment
 *
 * Live (`runner.ts`) and backtest (`backtest/engine-backtest.ts`) import the same object,
 * so a backtest always tests what production runs.
 */

export type StrategyName =
  | "trend_pullback"
  | "pre_pump"
  | "funding_squeeze"
  | "liquidity_sweep"
  | "breakout_retest";

export type Regime = "TREND" | "RANGE" | "HIGH_VOL";

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  trend_pullback: "Trend Pullback",
  pre_pump: "Pre-Pump",
  funding_squeeze: "Funding Squeeze",
  liquidity_sweep: "Liquidity Sweep",
  breakout_retest: "Breakout Retest",
};

export const ENGINE_CONFIG = {
  // ───────────── Universe & data ─────────────
  universe: {
    /** Minimum 24h quote volume in USD. Below this, pumps are easy to manipulate → symbol skipped. */
    minQuoteVolumeUsd: 20_000_000,
    /** Max symbols scanned per run (top by 24h volume). Keeps one run inside Binance weight limits (~7 weight/symbol). */
    maxSymbols: 40,
    /** Never scanned (stable/pegged pairs move ~0 and only produce noise). */
    exclude: ["USDCUSDT", "FDUSDUSDT", "TUSDUSDT", "USDPUSDT", "BTCDOMUSDT"],
    /** Concurrent symbol fetches in a live run. Higher = faster run, more burst load on Binance. */
    fetchConcurrency: 6,
  },

  /** Candles loaded per timeframe. Must cover the longest lookback (EMA200 + warmup on 4H/1H, BB percentile 100 on 15m). */
  history: {
    "4h": 260,
    "1h": 260,
    "15m": 220,
    "5m": 60,
    /** Open-interest points (15m period) = 25h. Covers "OI +x% / 4h" and "OI at 24h high". */
    oiPoints: 100,
  },

  // ───────────── Market regime (4H, per symbol) ─────────────
  regime: {
    adxPeriod: 14,
    /** ADX above this + EMA alignment → TREND. Below → RANGE. */
    adxTrend: 20,
    emaFast: 50,
    emaSlow: 200,
    atrPeriod: 14,
    /** ATR is compared with its own SMA over this many 4H bars. */
    atrAvgPeriod: 50,
    /** ATR > this × its average → HIGH_VOL (checked first, overrides TREND/RANGE). */
    highVolAtrMult: 1.8,
  },

  /** Which strategies may run in each regime. A strategy also needs `enabled: true` below. */
  routing: {
    TREND: ["trend_pullback", "breakout_retest", "funding_squeeze", "pre_pump"],
    RANGE: ["liquidity_sweep", "pre_pump", "funding_squeeze"],
    HIGH_VOL: ["liquidity_sweep", "funding_squeeze"],
  } as Record<Regime, StrategyName[]>,

  /** In HIGH_VOL the stop distance is multiplied by this (TPs are re-scaled to keep the same R multiples). */
  highVolStopMult: 1.3,

  // ───────────── Strategies ─────────────
  strategies: {
    trend_pullback: {
      enabled: true,
      /** 4H context: EMA50 vs EMA200 direction and ADX(14) above this. */
      adxMin: 20,
      /** 1H EMA band the pullback must reach. */
      emaBandFast: 20,
      emaBandSlow: 50,
      /** Alternative zone: Fibonacci retracement band of the last 1H impulse. */
      fibLow: 0.382,
      fibHigh: 0.618,
      /** Pivot strength (bars on each side) for 1H swing detection (impulse + TP1 target). */
      swingPivot1h: 3,
      /** The zone must have been touched within the last N closed 1H bars. */
      zoneLookback1h: 4,
      /** Pivot strength for the 15m lower-high / higher-low used by the break trigger. */
      swingPivot15m: 2,
      /** The broken 15m swing must be at most this many 15m bars old. */
      triggerSwingMaxAge: 24,
      /** SL = zone low − this × ATR(1H). */
      slAtr: 0.5,
      /** TP2 = this many R from entry midpoint. */
      tp2R: 2,
      /** TP1 falls back to this many R when no swing high sits between 0.5R and TP2. */
      tp1FallbackR: 1,
      baseConfidence: 55,
    },

    pre_pump: {
      enabled: true,
      /** Bollinger(20, 2) on 15m. */
      bbPeriod: 20,
      bbStd: 2,
      /** "Squeeze": BB bandwidth percentile ≤ this (%) over the last `bbRankWindow` 15m bars. */
      bbSqueezePct: 10,
      bbRankWindow: 100,
      /** Squeeze counts if it happened within the last N 15m bars (volume surge itself widens the bands). */
      squeezeRecentBars: 4,
      /** Volume: average of last `volBars` 15m bars > `volMult` × SMA(`volAvgPeriod`) of the bars before them. */
      volBars: 3,
      volMult: 2.5,
      volAvgPeriod: 20,
      /** OI rose at least this (%) over `oiWindowHours` while |price change| stayed within `flatPricePct` (%). */
      oiRisePct: 8,
      oiWindowHours: 4,
      flatPricePct: 2,
      /** BTC filter: BTC 1h move against the bias must not exceed this (%). Mirrored for short bias. */
      btcMaxAdverse1hPct: 1.5,
      /** WATCH fires when at least this many of the 4 conditions (squeeze, volume, OI, BTC) are true. */
      minConditions: 3,
      /** Pre-pump range = high/low of the last N 15m bars (4h). */
      rangeBars: 16,
      /** WATCH → ENTRY: a 15m close beyond the range with volume > this × average. */
      breakoutVolMult: 2,
      /** A breakout upgrades only if a WATCH state existed within the last N 15m bars. */
      watchValidBars: 24,
      /** ENTRY levels: SL at range midpoint ∓ this × ATR(15m); TP1/TP2 = 1× / 2× range height from entry. */
      slAtr: 0.25,
      tp1RangeMult: 1,
      tp2RangeMult: 2,
      baseConfidence: 50,
      watchConfidence: 40,
    },

    funding_squeeze: {
      enabled: true,
      /** Long (short-squeeze) setup: funding below this (frac). −0.0005 = −0.05%. */
      longFundingMax: -0.0005,
      /** Short (long-squeeze) setup: funding above this (frac). 0.0008 = +0.08%. */
      shortFundingMin: 0.0008,
      /** "OI rising": OI up at least this (%) over `oiWindowHours`. */
      oiRisePct: 2,
      oiWindowHours: 4,
      /** "OI at local high": OI ≥ this fraction of its 24h max. */
      oiLocalHighFrac: 0.98,
      /** "No new low/high": the last `recentBars` 15m bars did not exceed the extreme of the prior `priorBars`. */
      recentBars: 8,
      priorBars: 32,
      swingPivot15m: 2,
      triggerSwingMaxAge: 24,
      /** SL = last opposite 15m swing ∓ this × ATR(15m). */
      slAtr: 0.3,
      tp1R: 1.2,
      tp2R: 2.5,
      /** Bonus confidence when CVD / volume declines into a long-squeeze short. */
      cvdBonus: 8,
      cvdBars: 16,
      baseConfidence: 55,
    },

    liquidity_sweep: {
      enabled: true,
      /** Equal highs/lows: ≥ `equalMinTouches` 1H swing points within `equalTolAtr` × ATR(1H). */
      equalMinTouches: 2,
      equalTolAtr: 0.15,
      equalLookback1h: 72,
      swingPivot1h: 3,
      /** Sweep candle (15m) volume > this × SMA(volAvgPeriod). */
      volMult: 1.5,
      volAvgPeriod: 20,
      /** SL = wick tip ± this × ATR(15m). */
      slAtr: 0.1,
      /** Entry zone extends this × ATR(15m) from the confirmation close back toward the level. */
      entryZoneAtr: 0.3,
      baseConfidence: 55,
      /** Weekly levels are stronger liquidity than daily. */
      weeklyBonus: 8,
    },

    breakout_retest: {
      enabled: true,
      /** Range = the `rangeBars` 15m bars before the breakout candle. */
      rangeBars: 20,
      /** Range height must be below this × ATR(15m). */
      maxRangeAtr: 3,
      /** Breakout candle closes outside with volume > this × SMA(volAvgPeriod). */
      volMult: 2,
      volAvgPeriod: 20,
      /** Retest must happen within this many 15m bars after the breakout. */
      retestMaxBars: 8,
      /** "Touch" tolerance around the broken level, × ATR(15m). */
      retestTolAtr: 0.15,
      /** SL = broken level ∓ this × ATR(15m). */
      slAtr: 0.6,
      /** Entry zone = broken level → level ± this × ATR(15m). */
      entryZoneAtr: 0.3,
      tp1RangeMult: 1,
      tp2RangeMult: 2,
      baseConfidence: 55,
    },
  },

  /** Generic entry zone for trigger-candle strategies: close → close ∓ this × ATR(15m) (a limit zone, not a market order). */
  entryZoneAtr: 0.3,

  // ───────────── Supporting factors (confidence points only) ─────────────
  factors: {
    rsiPeriod: 14,
    /** Divergence is checked between the last two 15m swing points within this many bars. */
    divergenceLookback: 40,
    divergencePivot: 3,
    rsiDivergencePts: 5,
    cvdDivergencePts: 5,
    /** Relative strength vs BTC over this many 1H bars. */
    rsHours: 4,
    rsPts: 5,
    /** Price on the trade side of the UTC-session VWAP. */
    vwapPts: 3,
  },

  // ───────────── Confluence ─────────────
  confluence: {
    /** Same symbol + direction within this window are merged into ONE message. */
    windowMin: 30,
    /** Confidence added per extra agreeing strategy. */
    extraStrategyPts: 10,
    /** Grade thresholds by number of distinct strategies. */
    gradeB: 2,
    gradeA: 3,
  },

  // ───────────── Anti-late ─────────────
  antiLate: {
    /** Price more than this × ATR(15m) beyond the entry zone in the trade direction → MISSED, not sent. */
    maxChaseAtr: 0.8,
    /** Default signal validity (unfilled limit zone). 45 min = 3 × 15m trigger candles. */
    expiryMin: 45,
    /** Minimum reward:risk from entry midpoint to TP2. */
    minRR: 1.8,
    /**
     * Skip when round-trip cost (backtest.roundTripCostPct) is more than this many R — i.e. the stop
     * is so tight that fees eat the edge (0.12% cost on a 0.4% stop = 0.3R lost on every trade).
     */
    maxCostR: 0.25,
  },

  // ───────────── Dedup / cooldown ─────────────
  cooldown: {
    /** Same symbol + strategy + direction is silenced for this long after a signal. */
    sameSetupHours: 4,
    /** Max messages (ENTRY + WATCH) per rolling hour; highest grade wins. */
    maxPerHour: 10,
  },

  // ───────────── Lifecycle ─────────────
  lifecycle: {
    /** Fraction closed at TP1; the rest runs to TP2 with stop moved to breakeven + `beOffsetR`. */
    tp1ClosePct: 0.5,
    beOffsetR: 0.1,
    /** A filled trade still open after this long is closed at market (status "timeout"). */
    maxHoldHours: 48,
    /** Max open/pending signals updated per run (Binance load). */
    maxUpdatesPerRun: 40,
  },

  // ───────────── Backtest ─────────────
  backtest: {
    days: 180,
    /** Round-trip fee + slippage (%), deducted from every filled trade in R terms. */
    roundTripCostPct: 0.12,
  },
};

export type EngineConfig = typeof ENGINE_CONFIG;
