import crypto from 'node:crypto';
import { logEvent } from './events.js';
import { checkTradable, snapshot } from './schedule.js';

/*
 * Pure request handlers: (ctx, input) -> { status, body }.
 * ctx = { db (pool), config, sinks }. Express only does the wiring (server.js),
 * so all business rules are testable without a running server.
 */

const RANK = { new: 0, registered: 1, deposited: 2 };
const TRACK_ACTIONS = new Set([
  'signal_decision', 'tab_view', 'language_change', 'faq_open', 'register_modal_step',
  'paywall_view', 'schedule_open',
]);

/*
 * Access tiers (the monetisation ladder):
 *   new         3 free signals, ONCE (lifetime) -> paywall: register
 *   registered  REG_FREE_LIMIT signals / day (set to 1) -> paywall: deposit   (partner postback `reg`)
 *   deposited   unlimited                                        (partner postback `ftd`)
 * Each tier counts its own attempts, so registering gives a fresh batch instead of eating into the old one.
 */
const tierOf = (user) => (user.status === 'deposited' ? 'unlimited' : user.status === 'registered' ? 'registered' : 'new');
const limitOf = (config, tier) => (tier === 'registered' ? config.regFreeLimit : config.freeLimit);
const nowOf = (ctx) => (ctx.clock ? ctx.clock() : new Date());

export function dayKey(config, date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: config.dayTz }); // YYYY-MM-DD in the configured timezone
}

// signal_uses is keyed by (telegram_id, day): the "registered" tier uses "<day>:reg", so no schema change is needed.
const usageKey = (ctx, tier) => dayKey(ctx.config, nowOf(ctx)) + (tier === 'registered' ? ':reg' : '');

async function upsertUser(ctx, tg) {
  const now = Date.now();
  const label = ctx.config.testUsers[String(tg.id)] ?? null;
  
  // MySQL синтаксис для UPSERT (INSERT ... ON DUPLICATE KEY UPDATE)
  await ctx.db.execute(
    `INSERT INTO users(telegram_id, username, first_name, label, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       username = VALUES(username),
       first_name = VALUES(first_name),
       label = COALESCE(VALUES(label), label),
       last_seen_at = VALUES(last_seen_at)`,
    [tg.id, tg.username ?? null, tg.first_name ?? null, label, now, now]
  );

  const [rows] = await ctx.db.execute('SELECT * FROM users WHERE telegram_id = ?', [tg.id]);
  return rows[0];
}

async function usedToday(ctx, telegramId, tier) {
  if (tier === 'new') {
    // New users get their free signals ONCE (lifetime), not per day: sum every day's usage of the "new" tier.
    const [rows] = await ctx.db.execute(
      "SELECT COALESCE(SUM(n), 0) AS n FROM signal_uses WHERE telegram_id = ? AND day NOT LIKE '%:reg'",
      [telegramId]
    );
    return Number(rows[0]?.n ?? 0);
  }
  const [rows] = await ctx.db.execute(
    'SELECT n FROM signal_uses WHERE telegram_id = ? AND day = ?',
    [telegramId, usageKey(ctx, tier)]
  );
  return rows[0]?.n ?? 0;
}

async function publicState(ctx, user) {
  const tier = tierOf(user);
  const unlimited = tier === 'unlimited';
  const limit = limitOf(ctx.config, tier);
  const used = unlimited ? 0 : await usedToday(ctx, user.telegram_id, tier);
  const c = ctx.config;
  return {
    status: user.status,
    tier,
    registered: RANK[user.status] >= RANK.registered,
    unlimited,
    freeLimit: limit,
    freeLeft: unlimited ? null : Math.max(0, limit - used),
    traderId: user.trader_id,
    offer: {
      minDeposit: c.minDeposit, recDeposit: c.recDeposit, promoCode: c.promoCode, promoBonusPct: c.promoBonusPct,
      regFreeLimit: c.regFreeLimit, freeLimit: c.freeLimit,
    },
  };
}

/** GET /api/me    (?open=1 on the first call of a session -> logs app_open) */
export async function me(ctx, tg, { open = false } = {}) {
  const user = await upsertUser(ctx, tg);
  if (open) await logEvent(ctx, { telegram_id: tg.id, type: 'app_open' });
  return { status: 200, body: await publicState(ctx, user) };
}

/** GET /api/assets - every asset with its open/closed state right now (schedule: see lib/schedule.js). */
export function assets(ctx) {
  return { status: 200, body: snapshot(nowOf(ctx)) };
}

/**
 * POST /api/signal - the server decides whether this attempt is allowed.
 * Order matters: (1) is the asset tradable right now, (2) is there a free attempt left, (3) spend it.
 * A closed market never costs the user an attempt.
 */
export async function signal(ctx, tg, body = {}) {
  const user = await upsertUser(ctx, tg);
  const state = await publicState(ctx, user);
  const details = { asset: String(body.asset ?? '').slice(0, 40), timeframe: String(body.timeframe ?? '').slice(0, 10) };

  const trade = checkTradable(body.asset, body.timeframe, nowOf(ctx));
  if (!trade.ok) {
    if (trade.reason === 'unknown_asset') return { status: 400, body: { error: 'unknown_asset', ...state } };
    await logEvent(ctx, { telegram_id: tg.id, type: 'signal_blocked_market', details: { ...details, reason: trade.reason } });
    const { ok, reason, ...extra } = trade;
    return { status: 409, body: { error: reason, ...extra, ...state } };
  }

  if (!state.unlimited && state.freeLeft <= 0) {
    await logEvent(ctx, { telegram_id: tg.id, type: 'signal_blocked', details: { ...details, tier: state.tier } });
    return { status: 403, body: { error: 'limit', ...state } };
  }
  if (!state.unlimited) {
    await ctx.db.execute(
      `INSERT INTO signal_uses(telegram_id, day, n) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE n = n + 1`,
      [tg.id, usageKey(ctx, state.tier)]
    );
  }
  await logEvent(ctx, { telegram_id: tg.id, type: 'signal_request', details: { ...details, tier: state.tier } });
  return { status: 200, body: { ok: true, ...(await publicState(ctx, user)) } };
}

/** POST /api/track  - whitelisted UI actions only. */
export async function track(ctx, tg, body = {}) {
  await upsertUser(ctx, tg);
  if (!TRACK_ACTIONS.has(body.action)) return { status: 400, body: { error: 'unknown_action' } };
  await logEvent(ctx, { telegram_id: tg.id, type: body.action, details: body.details ?? null });
  return { status: 200, body: { ok: true } };
}

async function issueClick(ctx, tg) {
  const clickId = crypto.randomBytes(8).toString('hex');
  await ctx.db.execute('INSERT INTO clicks(click_id, telegram_id, created_at) VALUES (?, ?, ?)', [clickId, tg.id, Date.now()]);
  return clickId;
}

const simLink = (ctx, clickId) => `${ctx.config.publicUrl}/partner-sim.html?click_id=${clickId}`;

/** POST /api/register/start - issues a click_id bound to this Telegram user and returns the partner link. */
export async function registerStart(ctx, tg) {
  const user = await upsertUser(ctx, tg);
  const clickId = await issueClick(ctx, tg);

  const template = ctx.config.partnerLinkTemplate || `${ctx.config.publicUrl}/partner-sim.html?click_id={click_id}`;
  const url = template.replaceAll('{click_id}', clickId);
  await logEvent(ctx, { telegram_id: tg.id, type: 'register_start', details: { click_id: clickId } });
  return { status: 200, body: { url, clickId, status: user.status } };
}

/**
 * POST /api/deposit/start - "Top up" button. Reuses the user's latest click_id (so the deposit postback is
 * attributed to the same person) and records the intent, which is the step between "registered" and "deposited".
 */
export async function depositStart(ctx, tg) {
  const user = await upsertUser(ctx, tg);
  if (RANK[user.status] < RANK.registered) return { status: 409, body: { error: 'not_registered', status: user.status } };

  const [rows] = await ctx.db.execute(
    'SELECT click_id FROM clicks WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 1',
    [tg.id]
  );
  const clickId = rows[0]?.click_id ?? (await issueClick(ctx, tg));
  const template = ctx.config.depositLinkTemplate || ctx.config.partnerLinkTemplate;
  const url = template ? template.replaceAll('{click_id}', clickId) : simLink(ctx, clickId);
  await logEvent(ctx, { telegram_id: tg.id, type: 'deposit_click', details: { click_id: clickId } });
  return { status: 200, body: { url, clickId, status: user.status } };
}

/** GET /admin/demo-reset (ENABLE_DEMO_TOOLS=1) - back to a fresh "new" user, so the funnel can be shown again. */
export async function demoReset(ctx, telegramId) {
  const id = Number(telegramId);
  if (!Number.isInteger(id)) return { status: 400, body: 'telegram_id required' };
  const [r] = await ctx.db.execute("UPDATE users SET status = 'new', trader_id = NULL WHERE telegram_id = ?", [id]);
  await ctx.db.execute('DELETE FROM signal_uses WHERE telegram_id = ?', [id]);
  await ctx.db.execute('DELETE FROM clicks WHERE telegram_id = ?', [id]);
  await logEvent(ctx, { telegram_id: id, type: 'demo_reset' });
  return { status: 200, body: r.affectedRows ? 'reset ok' : 'no such user' };
}

function safeEq(a, b) {
  const A = Buffer.from(String(a ?? ''));
  const B = Buffer.from(String(b ?? ''));
  return A.length === B.length && A.length > 0 && crypto.timingSafeEqual(A, B);
}

/**
 * GET /postback - called server-to-server by the partner (or by our simulator).
 * Expected query: secret, event, click_id, trader_id, sum, dt, country, src
 * Rules: fail closed without secret; log raw payload; idempotent; never downgrade status.
 */
export async function postback(ctx, query, ip = null) {
  if (!safeEq(query.secret, ctx.config.postbackSecret)) {
    if (!ctx.quiet) console.warn('[postback] rejected: bad secret from', ip);
    return { status: 403, body: 'forbidden' };
  }

  const { secret, ...clean } = query;
  const [rawResult] = await ctx.db.execute(
    'INSERT INTO postbacks_raw(ts, ip, query) VALUES (?, ?, ?)',
    [Date.now(), ip, JSON.stringify(clean).slice(0, 2000)]
  );
  const rawId = rawResult.insertId;

  const setNote = async (note) => {
    await ctx.db.execute('UPDATE postbacks_raw SET note = ? WHERE id = ?', [note, rawId]);
  };

  const event = String(clean.event ?? '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30);
  const source = ['real', 'sim'].includes(clean.src) ? clean.src : 'unknown';
  if (!event) {
    await setNote('no_event');
    return { status: 200, body: 'ignored' };
  }

  const dedupKey = [event, clean.trader_id, clean.dt, clean.sum, clean.click_id].join('|');
  
  // В MySQL используем INSERT IGNORE для идемпотентности
  const [dedupResult] = await ctx.db.execute(
    'INSERT IGNORE INTO postback_dedup(dedup_key, ts) VALUES (?, ?)',
    [dedupKey, Date.now()]
  );
  
  if (dedupResult.affectedRows === 0) {
    await setNote('duplicate');
    return { status: 200, body: 'duplicate' };
  }

  let click = null;
  if (clean.click_id) {
    const [clicksRows] = await ctx.db.execute('SELECT telegram_id FROM clicks WHERE click_id = ?', [String(clean.click_id)]);
    click = clicksRows[0];
  }

  // Fallback: the partner may omit/garble click_id on later events (deposits), but trader_id is stable.
  if (!click && clean.trader_id) {
    const [byTrader] = await ctx.db.execute('SELECT telegram_id FROM users WHERE trader_id = ?', [String(clean.trader_id).slice(0, 40)]);
    click = byTrader[0];
  }

  if (!click) {
    await setNote('unmatched');
    await logEvent(ctx, { type: `postback_${event}_unmatched`, source, details: { trader_id: clean.trader_id ?? null } });
    return { status: 200, body: 'unmatched' };
  }

  const tgId = click.telegram_id;
  const [userRows] = await ctx.db.execute('SELECT * FROM users WHERE telegram_id = ?', [tgId]);
  const user = userRows[0];
  
  const target = event === 'reg' ? 'registered' : event === 'ftd' ? 'deposited' : null;
  const traderId = clean.trader_id ? String(clean.trader_id).slice(0, 40) : null;

  if (target && RANK[target] > RANK[user.status]) {
    await ctx.db.execute('UPDATE users SET status = ?, trader_id = COALESCE(?, trader_id) WHERE telegram_id = ?', [target, traderId, tgId]);
  } else if (traderId && !user.trader_id) {
    await ctx.db.execute('UPDATE users SET trader_id = ? WHERE telegram_id = ?', [traderId, tgId]);
  }

  const typeMap = { reg: 'postback_registration', ftd: 'postback_ftd', dep: 'postback_deposit' };
  await logEvent(ctx, {
    telegram_id: tgId,
    type: typeMap[event] ?? `postback_${event}`,
    source,
    details: { trader_id: traderId, sum: clean.sum ?? null, country: clean.country ?? null },
  });
  
  await setNote('ok');
  return { status: 200, body: 'ok' };
}
