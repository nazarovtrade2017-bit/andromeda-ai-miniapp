# Mini App server (Express + SQLite)

Telegram Mini App backend for a demo funnel: **open → register (partner postback) → deposit**, with server-side
`initData` validation, a server-enforced free-signal limit, and an event log.

## Run
```bash
npm install
cp .env.example .env      # fill BOT_TOKEN, POSTBACK_SECRET, ADMIN_KEY
npm start                 # Node >= 22.5 (uses built-in node:sqlite)
npm test                  # 18 tests, no server needed
```
Local try-out without Telegram (`DEV_BYPASS_AUTH=1`, ignored in production):
```bash
curl -H "x-dev-user: 111:ivan" "localhost:3000/api/me?open=1"
curl -X POST -H "x-dev-user: 111:ivan" -H "content-type: application/json" -d '{"asset":"EUR/USD","timeframe":"3m"}' localhost:3000/api/signal
curl -X POST -H "x-dev-user: 111:ivan" localhost:3000/api/register/start      # -> simulator link with click_id
```
Then open the returned link, press the buttons, and watch `/admin?key=ADMIN_KEY`.

## Status
- Client (`public/index.html`) is wired to the API: state and the free-signal limit come from the server,
  registration goes through `/api/register/start` + partner postback, the app polls `/api/me` while waiting.
- `npm test` also runs the real client script against the real handlers (`test/client.test.js`).
- Local run without Telegram: start the server with `DEV_BYPASS_AUTH=1`, open `http://localhost:3000/?dev=111:ivan`.
- Still to do: Google Sheets / Telegram notification sinks, deploy, real partner link.

## Flow
```
Mini App --(Authorization: tma <initData>)--> /api/*  --> verified Telegram ID
/api/register/start  -> click_id bound to the user -> partner link
Partner --(GET /postback?secret=..&event=..&click_id=..)--> status + event log
Mini App polls /api/me on the waiting screen and switches screens
```

## Endpoints
| Route | Auth | Purpose |
|---|---|---|
| `GET /api/me[?open=1]` | initData | status, free attempts left (`open=1` logs `app_open`) |
| `POST /api/signal` | initData | allowed? 3/day for `new`, unlimited after registration |
| `POST /api/track` | initData | whitelisted UI actions |
| `POST /api/register/start` | initData | issue `click_id`, return partner link |
| `GET /postback` | shared secret | partner events: `reg`, `ftd`, `dep`, others are only logged |
| `GET /admin?key=` | admin key | funnel, events, raw postbacks |
| `GET /sim/fire` | `ENABLE_SIM=1` | partner simulator (same code path as `/postback`) |

## Switching to the real partner
1. Put the tracking link into `PARTNER_LINK_TEMPLATE`, with `{click_id}` where the partner expects the sub-id.
2. In the partner cabinet create one postback per event, adding your own `event=` and `src=real`:
   `https://HOST/postback?secret=...&event=reg&src=real&click_id={click_id}&trader_id={TRADER_ID}&country={COUNTRY}&dt={DATE_TIME}`
   (`ftd` / `dep` also get `&sum={SUMDEP}`). Macro names come from the cabinet's list.
3. Make one real test registration and read `/admin` -> "Сырые постбеки" to confirm the real payload.

## Not production-grade (on purpose)
No rate limiting, single SQLite file, events table is the only audit trail, partner IP allow-list and HMAC
signature not available from the partner, Google Sheets / Telegram notification sinks are planned (`ctx.sinks`).
