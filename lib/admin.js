const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmt = (ts) => (ts ? new Date(Number(ts)).toISOString().replace('T', ' ').slice(0, 19) : '—');

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

export async function renderAdmin(db, query = {}) {
  const activeTab = query.tab === 'users' ? 'users' : 'events';
  const f = await funnel(db);
  
  // Получаем события для первой вкладки
  const [events] = await db.execute(
    `SELECT e.*, u.username, u.label FROM events e
     LEFT JOIN users u ON u.telegram_id = e.telegram_id ORDER BY e.id DESC LIMIT 200`
  );
  
  // Получаем пользователей для второй вкладки
  const [usersList] = await db.execute(
    `SELECT * FROM users ORDER BY last_seen_at DESC LIMIT 200`
  );
  
  const [raws] = await db.execute('SELECT * FROM postbacks_raw ORDER BY id DESC LIMIT 50');

  const who = (e) =>
    e.telegram_id ? `<span class="user-badge">${esc(e.label ?? 'user')}</span> ${e.username ? '@' + esc(e.username) : ''} <small>#${e.telegram_id}</small>` : '—';

  // Цветовые бейджи для статусов пользователей
  const renderStatus = (status) => {
    const colors = {
      new: 'background: #e2e8f0; color: #475569;',
      registered: 'background: #dbeafe; color: #1e40af;',
      deposited: 'background: #dcfce7; color: #166534; font-weight: 600;'
    };
    return `<span style="padding: 3px 8px; border-radius: 6px; font-size: 11px; ${colors[status] || ''}">${esc(status)}</span>`;
  };

  // Цветовые бейджи для типов событий
  const renderEventType = (type) => {
    let style = 'background: #f1f5f9; color: #334155;';
    if (type === 'app_open') style = 'background: #f0fdf4; color: #15803d;';
    if (type.includes('register')) style = 'background: #eff6ff; color: #1d4ed8;';
    if (type.includes('signal')) style = 'background: #faf5ff; color: #7e22ce;';
    return `<span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; ${style}">${esc(type)}</span>`;
  };

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="refresh" content="15">
<title>Admin Panel</title><style>
:root {
  --bg: #f8fafc;
  --card-bg: #ffffff;
  --text: #0f172a;
  --border: #e2e8f0;
  --primary: #059669;
}
body { font: 13px/1.4 system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; background: var(--bg); color: var(--text); }
h1, h2 { margin: 0 0 12px 0; font-size: 18px; }
.f { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.c { background: var(--card-bg); border: 1px solid var(--border); border-radius: 10px; padding: 12px 20px; box-shadow: 0 1px 2px rgba(0,0,0,0.02); }
.c b { display: block; font-size: 24px; color: var(--primary); margin-top: 4px; }
.tabs { display: flex; gap: 8px; margin-bottom: 16px; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
.tab { padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 500; color: #64748b; background: #e2e8f050; }
.tab.active { background: var(--primary); color: #fff; }
table { border-collapse: collapse; width: 100%; background: var(--card-bg); border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
th, td { border-bottom: 1px solid var(--border); padding: 10px 12px; text-align: left; vertical-align: middle; }
th { background: #f1f5f9; font-weight: 600; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
tr:hover td { background: #f8fafc; }
code { font-family: monospace; font-size: 11px; background: #f1f5f9; padding: 2px 4px; border-radius: 4px; }
.user-badge { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #475569; }
.sim { color: #b36b00; }
.real { color: #059669; font-weight: 600; }
</style></head><body>

<h1>Воронка конверсии</h1>
<div class="f">
  <div class="c">Зашли <b>${f.opened}</b></div>
  <div class="c">Начали регистрацию <b>${f.startedRegistration}</b></div>
  <div class="c">Зарегистрировались <b>${f.registered}</b></div>
  <div class="c">Пополнили <b>${f.deposited}</b></div>
</div>

<div class="tabs">
  <a href="?tab=events" class="tab ${activeTab === 'events' ? 'active' : ''}">📡 Лента событий</a>
  <a href="?tab=users" class="tab ${activeTab === 'users' ? 'active' : ''}">👥 Пользователи и активность</a>
</div>

${activeTab === 'events' ? `
  <h2>Лента событий</h2>
  <table>
    <tr><th>Время (UTC)</th><th>Пользователь</th><th>Действие</th><th>Источник</th><th>Детали</th></tr>
    ${events.map((e) => `
      <tr>
        <td>${fmt(e.ts)}</td>
        <td>${who(e)}</td>
        <td>${renderEventType(e.type)}</td>
        <td class="${esc(e.source)}">${esc(e.source)}</td>
        <td><code>${esc(e.details)}</code></td>
      </tr>`).join('')}
  </table>

  <h2 style="margin-top: 30px;">Сырые постбеки (последние 50)</h2>
  <table>
    <tr><th>Время (UTC)</th><th>IP</th><th>Запрос</th><th>Результат</th></tr>
    ${raws.map((r) => `
      <tr>
        <td>${fmt(r.ts)}</td>
        <td>${esc(r.ip)}</td>
        <td><code>${esc(r.query)}</code></td>
        <td>${esc(r.note)}</td>
      </tr>`).join('')}
  </table>
` : `
  <h2>База пользователей</h2>
  <table>
    <tr><th>Telegram ID</th><th>Пользователь</th><th>Статус</th><th>Последняя активность</th><th>Регистрация</th></tr>
    ${usersList.map((u) => `
      <tr>
        <td><code>#${u.telegram_id}</code></td>
        <td>${u.username ? '@' + esc(u.username) : '—'} ${u.first_name ? '(' + esc(u.first_name) + ')' : ''}</td>
        <td>${renderStatus(u.status)}</td>
        <td>${fmt(u.last_seen_at)}</td>
        <td>${fmt(u.created_at)}</td>
      </tr>`).join('')}
  </table>
`}

</body></html>`;
}
