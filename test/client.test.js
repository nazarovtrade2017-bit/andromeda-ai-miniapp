/**
 * Integration test: runs the real Mini App client script (public/index.html) against the real
 * server handlers. Only the browser (DOM, timers, fetch transport) is stubbed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadConfig } from '../lib/config.js';
import { openDb } from '../lib/db.js';
import * as h from '../lib/handlers.js';

const config = loadConfig({ POSTBACK_SECRET: 's3cret', FREE_LIMIT: '3', DAY_TZ: 'UTC' });
const ctx = { db: openDb(':memory:'), config, sinks: [], quiet: true };

// ---- minimal browser stubs ----
const els = {};
function el(id) {
  if (els[id]) return els[id];
  const cls = new Set();
  return (els[id] = {
    id, innerHTML: '', textContent: '', style: {},
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c) => (cls.has(c) ? cls.delete(c) : cls.add(c)), contains: (c) => cls.has(c) },
    setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
  });
}
const opened = [];
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };

globalThis.window = { open: (u) => opened.push(u) };
globalThis.location = { search: '?dev=42:papa' };
globalThis.document = { getElementById: el, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
globalThis.Telegram = { WebApp: { ready() {}, expand() {}, setHeaderColor() {}, setBackgroundColor() {} } };
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.setTimeout = (f) => { f(); return 0; };     // skip the 2.5s "analysis" animation
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => {};
globalThis.fetch = async (url, opts = {}) => {            // in-process transport to the real handlers
  const u = new URL(url, 'http://x');
  const [id, username] = String((opts.headers || {})['x-dev-user'] || '').split(':');
  const tg = { id: Number(id), username };
  const body = opts.body ? JSON.parse(opts.body) : {};
  let r = { status: 404, body: {} };
  if (u.pathname === '/api/me') r = h.me(ctx, tg, { open: u.searchParams.get('open') === '1' });
  if (u.pathname === '/api/signal') r = h.signal(ctx, tg, body);
  if (u.pathname === '/api/track') r = h.track(ctx, tg, body);
  if (u.pathname === '/api/register/start') r = h.registerStart(ctx, tg);
  return { status: r.status, json: async () => r.body };
};

const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
vm.runInThisContext(scripts.at(-1)[1]);

const view = () => el('v').innerHTML;
const count = (type) => ctx.db.prepare('SELECT COUNT(*) n FROM events WHERE type = ?').get(type).n;

test('client boots from the server state', async () => {
  await flush();
  assert.equal(S.loaded, true);
  assert.equal(S.freeLeft, 3);
  assert.match(view(), /quota/);
  assert.equal(count('app_open'), 1);
});

test('three free signals, then the block is gated by the server', async () => {
  for (let i = 2; i >= 0; i--) {
    start(); await flush();
    assert.equal(S.ph, 'res');
    assert.equal(S.freeLeft, i);
    decide('ok');
  }
  assert.match(view(), /gate-overlay/);
  assert.equal(count('signal_request'), 3);
  assert.equal(count('signal_decision'), 3);

  start(); await flush();
  assert.equal(S.ph, 'idle');                 // 4th attempt never reaches the animation
  assert.equal(count('signal_blocked'), 1);
});

test('registration: link with click_id -> partner postback -> unlimited', async () => {
  startRegistration(); await flush();
  assert.equal(opened.length, 1);
  const clickId = new URL(opened[0]).searchParams.get('click_id');
  assert.match(clickId, /^[0-9a-f]{16}$/);
  assert.match(el('modalContent').innerHTML, /Ждём подтверждения/);

  await checkStatus(false);                   // postback has not arrived yet
  assert.equal(S.isAuthorized, false);

  h.postback(ctx, { secret: 's3cret', event: 'reg', click_id: clickId, trader_id: '777', dt: 't1', src: 'sim' });
  await checkStatus(false);
  assert.equal(S.isAuthorized, true);
  assert.equal(S.poId, '777');
  assert.match(el('modalContent').innerHTML, /К сигналам/);   // success step shown automatically

  for (let i = 0; i < 6; i++) { start(); await flush(); assert.equal(S.ph, 'res'); decide('skip'); }
  assert.doesNotMatch(view(), /gate-overlay/);
});

test('deposit event updates the account card', async () => {
  const clickId = new URL(opened[0]).searchParams.get('click_id');
  h.postback(ctx, { secret: 's3cret', event: 'ftd', click_id: clickId, trader_id: '777', sum: '10', dt: 't2', src: 'sim' });
  await checkStatus(true);
  assert.equal(S.srv.status, 'deposited');
  assert.match(view(), /Депозит подтверждён/);
});

test('no leftover marketing claims or real affiliate links in the client', () => {
  for (const bad of ['SIG10', 'broker-qx', 'signalaisuppbot', 'pocketoption.com', '85-92', '90%+', 'Wall Street']) {
    assert.ok(!html.includes(bad), `found: ${bad}`);
  }
});
