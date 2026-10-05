const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (ts) => new Date(Number(ts)).toISOString().replace('T', ' ').slice(0, 19);

export async function funnel(db) {
  const one = async (sql) => {
    const [rows] = await db.execute(sql);
    return rows[0]?.n ?? 0;
  };
  
  return {
    opened: await one("SELECT COUNT(DISTINCT telegram_id) n FROM events WHERE type = 'app_open'"),
    startedRegistration: await one("SELECT COUNT(DISTINCT telegram_id) n FROM events WHERE type = 'register_start'"),
    registered: await one("SELECT COUNT(*) n FROM users WHERE status IN ('registered','deposited')"),
    deposited: await one("SELECT COUNT(*) n FROM users WHERE status = 'deposited'"),
  };
}

export async function renderAdmin(db) {
  const f = await funnel(db);
  
  const [events] = await db.execute(
    `SELECT e.*, u.username, u.label FROM events e
     LEFT JOIN users u ON u.telegram_id = e.telegram_id ORDER BY e.id DESC LIMIT 200`
  );
  
  const [raws] = await db.execute('SELECT * FROM postbacks_raw ORDER BY id DESC LIMIT 50');

  const who = (e) =>
    e.telegram_id ? `${esc(e.label ?? '')} ${e.username ? '@' + esc(e.username) : ''} <small>#${e.telegram_id}</small>` : '—';

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="10">
<title>Admin</title><style>
body{font:14px system-ui,sans-serif;margin:20px;background:#fafaf7;color:#1a2a22}
h1,h2{margin:.4em 0}.f{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0}
.c{background:#fff;border:1px solid #e0dccb;border-radius:12px;padding:10px 16px}.c b{display:block;font-size:22px;color:#0a7a55}
table{border-collapse:collapse;width:100%;background:#fff}th,td{border:1px solid #e8e4d4;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f1ede0}code{font-size:12px}.sim{color:#b36b00}.real{color:#0a7a55;font-weight:600}
</style></head><body>
<h1>Воронка</h1>
<div class="f">
<div class="c"><b>${f.opened}</b>зашли</div>
<div class="c"><b>${f.startedRegistration}</b>начали регистрацию</div>
<div class="c"><b>${f.registered}</b>зарегистрировались</div>
<div class="c"><b>${f.deposited}</b>пополнили</div></div>
<h2>События</h2>
<table><tr><th>Время (UTC)</th><th>Пользователь</th><th>Действие</th><th>Источник</th><th>Детали</th></tr>
${events
  .map(
    (e) => `<tr><td>${fmt(e.ts)}</td><td>${who(e)}</td><td>${esc(e.type)}</td>
<td class="${esc(e.source)}">${esc(e.source)}</td><td><code>${esc(e.details)}</code></td></tr>`
  )
  .join('')}</table>
<h2>Сырые постбеки (последние 50)</h2>
<table><tr><th>Время (UTC)</th><th>IP</th><th>Запрос</th><th>Результат</th></tr>
${raws.map((r) => `<tr><td>${fmt(r.ts)}</td><td>${esc(r.ip)}</td><td><code>${esc(r.query)}</code></td><td>${esc(r.note)}</td></tr>`).join('')}
</table></body></html>`;
}
