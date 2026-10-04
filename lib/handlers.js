import crypto from 'node:crypto';
import { logEvent } from './events.js';

/*
 * Pure request handlers: (ctx, input) -> { status, body }.
 * ctx = { db, config, sinks }. Express only does the wiring (server.js),
 * so all business rules are testable without a running server.
 */

const RANK = { new: 0, registered: 1, deposited: 2 };
const TRACK_ACTIONS = new Set(['signal_decision', 'tab_view', 'language_change', 'faq_open', 'register_modal_step']);

export function dayKey(config, date = new Date()) {
  return date.toLocaleDateString('sv-SE', { timeZone: config.dayTz }); // YYYY-MM-DD in the configured timezone
}

function upsertUser(ctx, tg) {
  const now = Date.now();
  const label = ctx.config.testUsers[String(tg.id)] ?? null;
  ctx.db
    .prepare(
      `INSERT INTO users(telegram_id, username, first_name, label, created_at, last_seen_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         username = excluded.username, first_name = excluded.first_name,
         label = COALESCE(excluded.label, users.label), last_seen_at = excluded.last_seen_at`
    )
    .run(tg.id, tg.username ?? null, tg.first_name ?? null, label, now, now);
  return ctx.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tg.id);
}

function usedToday(ctx, telegramId) {
  const row = ctx.db
    .prepare('SELECT n FROM signal_uses WHERE telegram_id = ? AND day = ?')
    .get(telegramId, dayKey(ctx.config));
  return row?.n ?? 0;
}

function publicState(ctx, user) {
  const unlimited = RANK[user.status] >= RANK.registered;
  return {
    status: user.status,
    unlimited,
    freeLimit: ctx.config.freeLimit,
    freeLeft: unlimited ? null : Math.max(0, ctx.config.freeLimit - usedToday(ctx, user.telegram_id)),
    traderId: user.trader_id,
  };
}

/** GET /api/me   (?open=1 on the first call of a session -> logs app_open) */
export function me(ctx, tg, { open = false } = {}) {
  const user = upsertUser(ctx, tg);
  if (open) logEvent(ctx, { telegram_id: tg.id, type: 'app_open' });
  return { status: 200, body: publicState(ctx, user) };
}

/** POST /api/signal  - the server decides whether this attempt is allowed. */
export function signal(ctx, tg, body = {}) {
  const user = upsertUser(ctx, tg);
  const state = publicState(ctx, user);
  const details = { asset: String(body.asset ?? '').slice(0, 20), timeframe: String(body.timeframe ?? '').slice(0, 10) };

  if (!state.unlimited && state.freeLeft <= 0) {
    logEvent(ctx, { telegram_id: tg.id, type: 'signal_blocked', details });
    return { status: 403, body: { error: 'limit', ...state } };
  }
  if (!state.unlimited) {
    ctx.db
      .prepare(
        `INSERT INTO signal_uses(telegram_id, day, n) VALUES (?,?,1)
         ON CONFLICT(telegram_id, day) DO UPDATE SET n = n + 1`
      )
      .run(tg.id, dayKey(ctx.config));
  }
  logEvent(ctx, { telegram_id: tg.id, type: 'signal_request', details });
  return { status: 200, body: { ok: true, ...publicState(ctx, user) } };
}

/** POST /api/track  - whitelisted UI actions only. */
export function track(ctx, tg, body = {}) {
  upsertUser(ctx, tg);
  if (!TRACK_ACTIONS.has(body.action)) return { status: 400, body: { error: 'unknown_action' } };
  logEvent(ctx, { telegram_id: tg.id, type: body.action, details: body.details ?? null });
  return { status: 200, body: { ok: true } };
}

/** POST /api/register/start - issues a click_id bound to this Telegram user and returns the partner link. */
export function registerStart(ctx, tg) {
  const user = upsertUser(ctx, tg);
  const clickId = crypto.randomBytes(8).toString('hex');
  ctx.db.prepare('INSERT INTO clicks(click_id, telegram_id, created_at) VALUES (?,?,?)').run(clickId, tg.id, Date.now());

  const template = ctx.config.partnerLinkTemplate || `${ctx.config.publicUrl}/partner-sim.html?click_id={click_id}`;
  const url = template.replaceAll('{click_id}', clickId);
  logEvent(ctx, { telegram_id: tg.id, type: 'register_start', details: { click_id: clickId } });
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
export function postback(ctx, query, ip = null) {
  if (!safeEq(query.secret, ctx.config.postbackSecret)) {
    if (!ctx.quiet) console.warn('[postback] rejected: bad secret from', ip);
    return { status: 403, body: 'forbidden' };
  }

  const { secret, ...clean } = query; // never store the secret
  const raw = ctx.db
    .prepare('INSERT INTO postbacks_raw(ts, ip, query) VALUES (?,?,?)')
    .run(Date.now(), ip, JSON.stringify(clean).slice(0, 2000));
  const setNote = (note) => ctx.db.prepare('UPDATE postbacks_raw SET note = ? WHERE id = ?').run(note, raw.lastInsertRowid);

  const event = String(clean.event ?? '').toLowerCase().replace(/[^a-z_]/g, '').slice(0, 30);
  const source = ['real', 'sim'].includes(clean.src) ? clean.src : 'unknown';
  if (!event) {
    setNote('no_event');
    return { status: 200, body: 'ignored' };
  }

  // The partner sends no event id, so build an idempotency key from stable fields.
  const dedupKey = [event, clean.trader_id, clean.dt, clean.sum, clean.click_id].join('|');
  const seen = ctx.db.prepare('INSERT OR IGNORE INTO postback_dedup(dedup_key, ts) VALUES (?,?)').run(dedupKey, Date.now());
  if (seen.changes === 0) {
    setNote('duplicate');
    return { status: 200, body: 'duplicate' };
  }

  const click = clean.click_id
    ? ctx.db.prepare('SELECT telegram_id FROM clicks WHERE click_id = ?').get(String(clean.click_id))
    : null;
  if (!click) {
    setNote('unmatched');
    logEvent(ctx, { type: `postback_${event}_unmatched`, source, details: { trader_id: clean.trader_id ?? null } });
    return { status: 200, body: 'unmatched' }; // 200 on purpose: the partner must not keep retrying
  }

  const tgId = click.telegram_id;
  const user = ctx.db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(tgId);
  const target = event === 'reg' ? 'registered' : event === 'ftd' ? 'deposited' : null;
  const traderId = clean.trader_id ? String(clean.trader_id).slice(0, 40) : null;

  if (target && RANK[target] > RANK[user.status]) {
    ctx.db.prepare('UPDATE users SET status = ?, trader_id = COALESCE(?, trader_id) WHERE telegram_id = ?').run(target, traderId, tgId);
  } else if (traderId && !user.trader_id) {
    ctx.db.prepare('UPDATE users SET trader_id = ? WHERE telegram_id = ?').run(traderId, tgId);
  }

  const typeMap = { reg: 'postback_registration', ftd: 'postback_ftd', dep: 'postback_deposit' };
  logEvent(ctx, {
    telegram_id: tgId,
    type: typeMap[event] ?? `postback_${event}`,
    source,
    details: { trader_id: traderId, sum: clean.sum ?? null, country: clean.country ?? null },
  });
  setNote('ok');
  return { status: 200, body: 'ok' };
}
