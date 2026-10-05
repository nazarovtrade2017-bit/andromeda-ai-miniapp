import express from 'express';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { loadConfig } from './lib/config.js';
import { makeAuth } from './lib/auth.js';
import * as h from './lib/handlers.js';
import { renderAdmin } from './lib/admin.js';

const config = loadConfig();

// Создание пула подключений к MySQL / Railway
const pool = mysql.createPool({
  host: process.env.MYSQLHOST || config.dbHost || 'localhost',
  user: process.env.MYSQLUSER || config.dbUser || 'root',
  password: process.env.MYSQLPASSWORD || config.dbPassword || '',
  database: process.env.MYSQLDATABASE || config.dbName || 'railway',
  port: Number(process.env.MYSQLPORT || config.dbPort || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const ctx = { db: pool, config, sinks: [] };
// Later: ctx.sinks.push(googleSheetsSink, telegramNotifySink);

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

const send = (res, r) => res.status(r.status).send(r.body);
const sendJson = (res, r) => res.status(r.status).json(r.body);

// --- Partner postback (server-to-server, protected by shared secret) ---
app.get('/postback', async (req, res) => {
  try {
    const result = await h.postback(ctx, req.query, req.ip);
    send(res, result);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// --- Mini App API (every route requires valid Telegram initData) ---
const api = express.Router();
api.use(makeAuth(config));
api.get('/me', async (req, res) => sendJson(res, await h.me(ctx, req.tgUser, { open: req.query.open === '1' })));
api.post('/signal', async (req, res) => sendJson(res, await h.signal(ctx, req.tgUser, req.body)));
api.post('/track', async (req, res) => sendJson(res, await h.track(ctx, req.tgUser, req.body)));
api.post('/register/start', async (req, res) => sendJson(res, await h.registerStart(ctx, req.tgUser)));
app.use('/api', api);

// --- Admin view (protected by ADMIN_KEY) ---
app.get('/admin', async (req, res) => {
  const given = Buffer.from(String(req.query.key ?? ''));
  const want = Buffer.from(config.adminKey);
  if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.sendStatus(403);
  const adminHtml = await renderAdmin(ctx.db);
  res.type('html').send(adminHtml);
});

// --- Partner simulator (only when ENABLE_SIM=1) ---
if (config.enableSim) {
  app.get('/sim/fire', async (req, res) => {
    const { event, click_id, trader_id, sum, country } = req.query;
    const r = await h.postback(ctx, { event, click_id, trader_id, sum, country, dt: new Date().toISOString(), src: 'sim', secret: config.postbackSecret }, req.ip);
    send(res, r);
  });
}

app.use(express.static('public'));
app.get('/healthz', (_req, res) => res.send('ok'));

// Обязательно указываем порт из окружения Railway (или config.port) и '0.0.0.0' для внешних запросов
const PORT = Number(process.env.PORT) || config.port || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on 0.0.0.0:${PORT}  devBypass=${config.devBypass}  sim=${config.enableSim}`);
  if (!config.botToken && !config.devBypass) console.warn('WARNING: BOT_TOKEN is empty - all /api calls will return 401');
  if (!config.postbackSecret) console.warn('WARNING: POSTBACK_SECRET is empty - /postback rejects everything');
});
