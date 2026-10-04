import express from 'express';
import crypto from 'node:crypto';
import { loadConfig } from './lib/config.js';
import { openDb } from './lib/db.js';
import { makeAuth } from './lib/auth.js';
import * as h from './lib/handlers.js';
import { renderAdmin } from './lib/admin.js';

const config = loadConfig();
const ctx = { db: openDb(config.dbPath), config, sinks: [] };
// Later: ctx.sinks.push(googleSheetsSink, telegramNotifySink);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

const send = (res, r) => res.status(r.status).send(r.body);
const sendJson = (res, r) => res.status(r.status).json(r.body);

// --- Partner postback (server-to-server, protected by shared secret) ---
app.get('/postback', (req, res) => send(res, h.postback(ctx, req.query, req.ip)));

// --- Mini App API (every route requires valid Telegram initData) ---
const api = express.Router();
api.use(makeAuth(config));
api.get('/me', (req, res) => sendJson(res, h.me(ctx, req.tgUser, { open: req.query.open === '1' })));
api.post('/signal', (req, res) => sendJson(res, h.signal(ctx, req.tgUser, req.body)));
api.post('/track', (req, res) => sendJson(res, h.track(ctx, req.tgUser, req.body)));
api.post('/register/start', (req, res) => sendJson(res, h.registerStart(ctx, req.tgUser)));
app.use('/api', api);

// --- Admin view (protected by ADMIN_KEY) ---
app.get('/admin', (req, res) => {
  const given = Buffer.from(String(req.query.key ?? ''));
  const want = Buffer.from(config.adminKey);
  if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.sendStatus(403);
  res.type('html').send(renderAdmin(ctx.db));
});

// --- Partner simulator (only when ENABLE_SIM=1): fires the SAME /postback logic server-side,
//     so the shared secret never reaches the browser. ---
if (config.enableSim) {
  app.get('/sim/fire', (req, res) => {
    const { event, click_id, trader_id, sum, country } = req.query;
    const r = h.postback(ctx, { event, click_id, trader_id, sum, country, dt: new Date().toISOString(), src: 'sim', secret: config.postbackSecret }, req.ip);
    send(res, r);
  });
}

app.use(express.static('public'));
app.get('/healthz', (_req, res) => res.send('ok'));

app.listen(config.port, () => {
  console.log(`Server on :${config.port}  devBypass=${config.devBypass}  sim=${config.enableSim}`);
  if (!config.botToken && !config.devBypass) console.warn('WARNING: BOT_TOKEN is empty - all /api calls will return 401');
  if (!config.postbackSecret) console.warn('WARNING: POSTBACK_SECRET is empty - /postback rejects everything');
});
