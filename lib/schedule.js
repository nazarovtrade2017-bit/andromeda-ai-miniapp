/*
 * Trading schedule of the broker (PocketOption), the single source of truth for BOTH the server
 * (a signal for a closed asset is refused and does not spend a free attempt) and the client
 * (asset list with open/closed state, schedule screen).
 *
 * Source: https://pocketoption.com/ru/assets/?day=N  (N = 1..6 Mon..Sat, 0 = Sun) and /ru/assets-otc/.
 * The broker publishes the schedule in SERVER time, fixed UTC+2 (no DST), snapshot taken 2026-10-12.
 *   - Mon-Fri: currencies 02:00-22:45 (GBP/CAD, GBP/CHF from 04:10), indices 00:30-22:45, stocks 16:35-21:00
 *   - Sat-Sun: only crypto (24h). Currencies / indices / stocks are closed.
 *   - OTC assets: 24/7, including weekends.
 * If the broker changes hours, edit WINDOWS / the asset lists below - nothing else needs to change.
 */

export const SERVER_OFFSET_MIN = 120; // UTC+2
const MIN = 60_000;
const DAY = 86_400_000;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAYS = [1, 2, 3, 4, 5];

const hm = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** Trading windows in server time. days: 0 = Sunday ... 6 = Saturday. always = open around the clock. */
export const WINDOWS = {
  fx:     { o: hm('02:00'), c: hm('22:45'), days: WORKDAYS },
  fxLate: { o: hm('04:10'), c: hm('22:45'), days: WORKDAYS },
  idx:    { o: hm('00:30'), c: hm('22:45'), days: WORKDAYS },
  stock:  { o: hm('16:35'), c: hm('21:00'), days: WORKDAYS },
  all:    { o: 0, c: 1440, days: ALL_DAYS, always: true },
};

/** Groups shown on the schedule screen. */
export const GROUPS = [
  { id: 'forex', otc: false, wins: ['fx', 'fxLate'] },
  { id: 'index', otc: false, wins: ['idx'] },
  { id: 'stock', otc: false, wins: ['stock'] },
  { id: 'crypto', otc: false, wins: ['all'] },
  { id: 'otc', otc: true, wins: ['all'] },
];

const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

/* ---------- regular market ---------- */
const FOREX = list(`EUR/USD, AUD/CAD, AUD/CHF, AUD/JPY, AUD/USD, CAD/CHF, CAD/JPY, CHF/JPY, EUR/AUD, EUR/CAD, EUR/CHF,
  EUR/GBP, EUR/JPY, GBP/AUD, GBP/CAD, GBP/CHF, GBP/JPY, GBP/USD, USD/CAD, USD/CHF, USD/JPY`);
const FOREX_LATE = new Set(['GBP/CAD', 'GBP/CHF']);
const CRYPTO = list('Bitcoin, Dash, Ethereum, BCH/EUR, BCH/GBP, BCH/JPY, BTC/GBP, BTC/JPY, Chainlink');
const INDICES = list(`AUS 200, US100, E35EUR, 100GBP, F40/EUR, JPN225, D30/EUR, E50/EUR, SP500, DJI30, AEX 25, CAC 40,
  HONG KONG 33, SMI 20`);
const STOCKS = list(`Apple, Boeing Company, JPMorgan Chase & Co, McDonald's, Microsoft, American Express, Johnson & Johnson,
  Pfizer Inc, ExxonMobil, Cisco, FACEBOOK INC, Intel, Netflix, Alibaba, Tesla, Citigroup Inc`);

/* ---------- OTC (24/7) ---------- */
const OTC_FOREX = list(`EUR/USD, AUD/CAD, AUD/CHF, AUD/JPY, AUD/NZD, AUD/USD, CAD/CHF, CAD/JPY, CHF/JPY, EUR/CHF, EUR/GBP,
  EUR/JPY, EUR/NZD, GBP/AUD, GBP/JPY, GBP/USD, NZD/JPY, NZD/USD, USD/CAD, USD/CHF, USD/JPY, USD/RUB, EUR/RUB, CHF/NOK,
  EUR/HUF, USD/CNH, EUR/TRY, USD/INR, USD/SGD, USD/CLP, USD/MYR, USD/THB, USD/VND, USD/PKR, USD/COP, USD/EGP, USD/PHP,
  USD/MXN, USD/DZD, USD/ARS, USD/IDR, USD/BRL, USD/BDT, YER/USD, LBP/USD, TND/USD, MAD/USD, BHD/CNY, AED/CNY, SAR/CNY,
  QAR/CNY, OMR/CNY, JOD/CNY, NGN/USD, KES/USD, ZAR/USD, UAH/USD`);
const OTC_COMMODITIES = list('Gold, Brent Oil, WTI Crude Oil, Silver, Natural Gas, Platinum spot, Palladium spot');
const OTC_STOCKS = list(`Apple, McDonald's, Microsoft, FACEBOOK INC, Intel, Tesla, Pfizer Inc, Johnson & Johnson, Boeing Company,
  American Express, Amazon, Citigroup Inc, FedEx, VISA, Cisco, ExxonMobil, Alibaba, Netflix, VIX, Palantir Technologies,
  GameStop Corp, Advanced Micro Devices, Coinbase Global, Marathon Digital Holdings`);
const OTC_INDICES = list('AUS 200, E35EUR, 100GBP, F40EUR, JPN225, D30EUR, E50EUR, SP500, DJI30, US100');
const OTC_CRYPTO = list(`BNB, Solana, Cardano, TRON, Chainlink, Toncoin, Avalanche, Bitcoin, Dogecoin, Polkadot, Ethereum,
  Litecoin, Polygon, Bitcoin ETF`);

const OTC_SUFFIX = '-OTC';
const mk = (name, cat, otc, win) => ({ id: otc ? name + OTC_SUFFIX : name, cat, otc, win });

export const ASSETS = [
  ...FOREX.map((n) => mk(n, 'forex', false, FOREX_LATE.has(n) ? 'fxLate' : 'fx')),
  ...CRYPTO.map((n) => mk(n, 'crypto', false, 'all')),
  ...INDICES.map((n) => mk(n, 'index', false, 'idx')),
  ...STOCKS.map((n) => mk(n, 'stock', false, 'stock')),
  ...OTC_FOREX.map((n) => mk(n, 'forex', true, 'all')),
  ...OTC_CRYPTO.map((n) => mk(n, 'crypto', true, 'all')),
  ...OTC_COMMODITIES.map((n) => mk(n, 'commodity', true, 'all')),
  ...OTC_INDICES.map((n) => mk(n, 'index', true, 'all')),
  ...OTC_STOCKS.map((n) => mk(n, 'stock', true, 'all')),
];

const BY_ID = new Map(ASSETS.map((a) => [a.id, a]));
export const findAsset = (id) => BY_ID.get(String(id ?? '')) || null;

/** Server clock for a given instant: weekday (0 = Sun), minutes since server midnight, and server midnight in UTC ms. */
function serverClock(date) {
  const t = date.getTime() + SERVER_OFFSET_MIN * MIN;
  const dayStart = Math.floor(t / DAY) * DAY;
  return {
    dow: new Date(t).getUTCDay(),
    min: Math.floor((t - dayStart) / MIN),
    midnightUtcMs: dayStart - SERVER_OFFSET_MIN * MIN,
  };
}

/**
 * State of one asset at `date`.
 *   open      - tradable right now
 *   closesAt  - (open, not 24/7) UTC ms of today's close
 *   opensAt   - (closed) UTC ms of the next open
 */
export function assetStatus(asset, date = new Date()) {
  const w = WINDOWS[asset.win];
  if (w.always) return { open: true, opensAt: null, closesAt: null };

  const s = serverClock(date);
  if (w.days.includes(s.dow) && s.min >= w.o && s.min < w.c) {
    return { open: true, opensAt: null, closesAt: s.midnightUtcMs + w.c * MIN };
  }
  for (let k = 0; k <= 7; k++) {
    if (!w.days.includes((s.dow + k) % 7)) continue;
    const at = s.midnightUtcMs + k * DAY + w.o * MIN;
    if (at > date.getTime()) return { open: false, opensAt: at, closesAt: null };
  }
  return { open: false, opensAt: null, closesAt: null }; // not reachable with the current windows
}

/** "3 мин" / "3 min" -> 3 ; anything unexpected -> null. */
export function parseTimeframeMin(tf) {
  const n = parseInt(String(tf ?? ''), 10);
  return Number.isInteger(n) && n >= 1 && n <= 60 ? n : null;
}

/**
 * Can a signal for this asset and expiry be used now?
 * { ok: true } | { ok: false, reason: 'unknown_asset' | 'market_closed' | 'closing_soon', ... }
 * 'closing_soon': the market is open, but closes before the trade would expire.
 */
export function checkTradable(assetId, timeframe, date = new Date()) {
  const asset = findAsset(assetId);
  if (!asset) return { ok: false, reason: 'unknown_asset' };
  const st = assetStatus(asset, date);
  if (!st.open) return { ok: false, reason: 'market_closed', opensAt: st.opensAt };
  const tf = parseTimeframeMin(timeframe);
  if (tf && st.closesAt != null) {
    const left = Math.floor((st.closesAt - date.getTime()) / MIN);
    if (left < tf) return { ok: false, reason: 'closing_soon', minutesLeft: Math.max(0, left), closesAt: st.closesAt };
  }
  return { ok: true, closesAt: st.closesAt };
}

/** Payload for GET /api/assets. `now` lets the client correct for a wrong device clock. */
export function snapshot(date = new Date()) {
  return {
    now: date.getTime(),
    serverOffsetMin: SERVER_OFFSET_MIN,
    windows: WINDOWS,
    groups: GROUPS,
    assets: ASSETS.map((a) => {
      const s = assetStatus(a, date);
      return { id: a.id, cat: a.cat, otc: a.otc, win: a.win, open: s.open, opensAt: s.opensAt, closesAt: s.closesAt };
    }),
  };
}
