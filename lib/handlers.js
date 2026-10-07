import crypto from 'node:crypto';
import { logEvent } from './events.js';

/*
 * Pure request handlers: (ctx, input) -> { status, body }.
 * ctx = { db (pool), config, sinks }. Express only does the wiring (server.js),
 * so all business rules are testable without a running server.
 */

const RANK = { new: 0, registered: 1, deposited: 2 };
const TRACK_ACTIONS = new Set(['signal_decision', 'tab_view', 'language_change', 'faq_open', 'register_modal_step']);

export function dayKey(config, date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: config.dayTz }); // YYYY-MM-DD in the configured timezone
}

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

async function usedToday(ctx, telegramId) {
  const [rows] = await ctx.db.execute(
    'SELECT n FROM signal_uses WHERE telegram_id = ? AND day = ?',
    [telegramId, dayKey(ctx.config)]
  );
  return rows[0]?.n ?? 0;
}

async function publicState(ctx, user) {
  const unlimited = RANK[user.status] >= RANK.registered;
  const used = await usedToday(ctx, user.telegram_id);
  return {
    status: user.status,
    unlimited,
    freeLimit: ctx.config.freeLimit,
    freeLeft: unlimited ? null : Math.max(0, ctx.config.freeLimit - used),
    traderId: user.trader_id,
  };
}

/** GET /api/me    (?open=1 on the first call of a session -> logs app_open) */
export async function me(ctx, tg, { open = false } = {}) {
  const user = await upsertUser(ctx, tg);
  if (open) await logEvent(ctx, { telegram_id: tg.id, type: 'app_open' });
  return { status: 200, body: await publicState(ctx, user) };
}

/** POST /api/signal  - the server decides whether this attempt is allowed. */
export async function signal(ctx, tg, body = {}) {
  const user = await upsertUser(ctx, tg);
  const state = await publicState(ctx, user);
  const details = { asset: String(body.asset ?? '').slice(0, 20), timeframe: String(body.timeframe ?? '').slice(0, 10) };

  if (!state.unlimited && state.freeLeft <= 0) {
    await logEvent(ctx, { telegram_id: tg.id, type: 'signal_blocked', details });
    return { status: 403, body: { error: 'limit', ...state } };
  }
  if (!state.unlimited) {
    await ctx.db.execute(
      `INSERT INTO signal_uses(telegram_id, day, n) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE n = n + 1`,
      [tg.id, dayKey(ctx.config)]
    );
  }
  await logEvent(ctx, { telegram_id: tg.id, type: 'signal_request', details });
  return { status: 200, body: { ok: true, ...(await publicState(ctx, user)) } };
}

/** POST /api/track  - whitelisted UI actions only. */
export async function track(ctx, tg, body = {}) {
  await upsertUser(ctx, tg);
  if (!TRACK_ACTIONS.has(body.action)) return { status: 400, body: { error: 'unknown_action' } };
  await logEvent(ctx, { telegram_id: tg.id, type: body.action, details: body.details ?? null });
  return { status: 200, body: { ok: true } };
}

/** POST /api/register/start - issues a click_id bound to this Telegram user and returns the partner link. */
export async function registerStart(ctx, tg) {
  const user = await upsertUser(ctx, tg);
  const clickId = crypto.randomBytes(8).toString('hex');
  await ctx.db.execute('INSERT INTO clicks(click_id, telegram_id, created_at) VALUES (?, ?, ?)', [clickId, tg.id, Date.now()]);

  const template = ctx.config.partnerLinkTemplate || `${ctx.config.publicUrl}/partner-sim.html?click_id={click_id}`;
  const url = template.replaceAll('{click_id}', clickId);
  await logEvent(ctx, { telegram_id: tg.id, type: 'register_start', details: { click_id: clickId } });
  return { status: 200, body: { url, clickId, status: user.status } };
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
