import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validateInitData } from '../lib/auth.js';
import { loadConfig } from '../lib/config.js';
import { openDb } from '../lib/db.js';
import * as h from '../lib/handlers.js';
import { funnel, renderAdmin } from '../lib/admin.js';

const TOKEN = '123456:TEST_TOKEN';

function signInitData(user, { token = TOKEN, authDate = Math.floor(Date.now() / 1000), tamper = false } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH', user: JSON.stringify(user) });
  const dcs = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dcs).digest('hex'));
  if (tamper) params.set('user', JSON.stringify({ ...user, id: 999 }));
  return params.toString();
}

function makeCtx(over = {}) {
  const config = { ...loadConfig({ POSTBACK_SECRET: 's3cret', FREE_LIMIT: '3', DAY_TZ: 'UTC', TEST_USERS: '42:Папа' }), ...over };
  return { db: openDb(':memory:'), config, sinks: [], quiet: true };
}
const U = { id: 42, username: 'papa', first_name: 'Papa' };

test('initData: valid signature accepted', () => {
  assert.equal(validateInitData(signInitData(U), TOKEN)?.id, 42);
});
test('initData: tampered payload rejected', () => {
  assert.equal(validateInitData(signInitData(U, { tamper: true }), TOKEN), null);
});
test('initData: wrong bot token rejected', () => {
  assert.equal(validateInitData(signInitData(U, { token: 'other:TOKEN' }), TOKEN), null);
});
test('initData: expired data rejected', () => {
  assert.equal(validateInitData(signInitData(U, { authDate: Math.floor(Date.now() / 1000) - 7200 }), TOKEN), null);
});
test('initData: empty / garbage rejected', () => {
  assert.equal(validateInitData('', TOKEN), null);
  assert.equal(validateInitData('hash=zzz', TOKEN), null);
});

test('free users: 3 signals per day, 4th blocked on the server', () => {
  const ctx = makeCtx();
  assert.equal(h.me(ctx, U).body.freeLeft, 3);
  for (let i = 2; i >= 0; i--) {
    const r = h.signal(ctx, U, { asset: 'EUR/USD', timeframe: '3m' });
    assert.equal(r.status, 200);
    assert.equal(r.body.freeLeft, i);
  }
  const blocked = h.signal(ctx, U, {});
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'limit');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM events WHERE type='signal_blocked'").get().n, 1);
});

test('full funnel: start -> reg postback -> unlimited -> ftd', () => {
  const ctx = makeCtx();
  h.me(ctx, U, { open: true });
  const start = h.registerStart(ctx, U);
  assert.match(start.body.url, /partner-sim\.html\?click_id=[0-9a-f]{16}/);
  const click = start.body.clickId;

  // exhaust free attempts first
  for (let i = 0; i < 3; i++) h.signal(ctx, U, {});
  assert.equal(h.signal(ctx, U, {}).status, 403);

  const reg = h.postback(ctx, { secret: 's3cret', event: 'reg', click_id: click, trader_id: '777', dt: 't1', src: 'sim' });
  assert.equal(reg.body, 'ok');
  const state = h.me(ctx, U).body;
  assert.equal(state.status, 'registered');
  assert.equal(state.unlimited, true);
  assert.equal(state.traderId, '777');
  for (let i = 0; i < 10; i++) assert.equal(h.signal(ctx, U, {}).status, 200); // unlimited now

  h.postback(ctx, { secret: 's3cret', event: 'ftd', click_id: click, trader_id: '777', sum: '25', dt: 't2', src: 'sim' });
  assert.equal(h.me(ctx, U).body.status, 'deposited');

  const f = funnel(ctx.db);
  assert.deepEqual(f, { opened: 1, startedRegistration: 1, registered: 1, deposited: 1 });
});

test('postback: bad / missing secret rejected and not stored', () => {
  const ctx = makeCtx();
  assert.equal(h.postback(ctx, { secret: 'nope', event: 'reg' }).status, 403);
  assert.equal(h.postback(ctx, { event: 'reg' }).status, 403);
  assert.equal(ctx.db.prepare('SELECT COUNT(*) n FROM postbacks_raw').get().n, 0);
  const noSecretConfigured = makeCtx({ postbackSecret: '' });
  assert.equal(h.postback(noSecretConfigured, { secret: '', event: 'reg' }).status, 403); // fails closed
});

test('postback: duplicate delivery is idempotent', () => {
  const ctx = makeCtx();
  h.me(ctx, U);
  const { clickId } = h.registerStart(ctx, U).body;
  const q = { secret: 's3cret', event: 'reg', click_id: clickId, trader_id: '1', dt: 'x' };
  assert.equal(h.postback(ctx, q).body, 'ok');
  assert.equal(h.postback(ctx, q).body, 'duplicate');
  assert.equal(ctx.db.prepare("SELECT COUNT(*) n FROM events WHERE type='postback_registration'").get().n, 1);
});

test('postback: unknown click_id returns 200 and changes nothing', () => {
  const ctx = makeCtx();
  h.me(ctx, U);
  const r = h.postback(ctx, { secret: 's3cret', event: 'reg', click_id: 'deadbeef', trader_id: '5', dt: 'y' });
  assert.equal(r.status, 200);
  assert.equal(r.body, 'unmatched');
  assert.equal(h.me(ctx, U).body.status, 'new');
});

test('postback: status never downgrades; secret never stored; raw payload kept', () => {
  const ctx = makeCtx();
  h.me(ctx, U);
  const { clickId } = h.registerStart(ctx, U).body;
  h.postback(ctx, { secret: 's3cret', event: 'ftd', click_id: clickId, trader_id: '9', sum: '25', dt: 'a' });
  h.postback(ctx, { secret: 's3cret', event: 'reg', click_id: clickId, trader_id: '9', dt: 'b' }); // late registration event
  assert.equal(h.me(ctx, U).body.status, 'deposited');
  const raws = ctx.db.prepare('SELECT query FROM postbacks_raw').all();
  assert.equal(raws.length, 2);
  assert.ok(raws.every((r) => !r.query.includes('s3cret')));
});

test('track: whitelist enforced', () => {
  const ctx = makeCtx();
  assert.equal(h.track(ctx, U, { action: 'tab_view', details: { tab: 'history' } }).status, 200);
  assert.equal(h.track(ctx, U, { action: 'drop_tables' }).status, 400);
});

test('admin page: escapes HTML and shows test-user label', () => {
  const ctx = makeCtx();
  h.me(ctx, { id: 42, username: '<script>x</script>' }, { open: true });
  const html = renderAdmin(ctx.db);
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('Папа'));
});
