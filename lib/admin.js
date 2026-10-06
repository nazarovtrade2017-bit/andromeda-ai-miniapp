const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v) => Number(v) || 0;
const iso = (ts) => (ts ? new Date(num(ts)).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '');
// <time> is localised in the browser (see CLIENT_JS); the UTC text is the no-JS fallback
const timeTag = (ts) => (ts ? `<time data-ts="${num(ts)}">${esc(iso(ts))}</time>` : '<span class="mute">—</span>');
const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');

export async function funnel(db) {
  const one = async (sql) => {
    const [rows] = await db.execute(sql);
    return num(rows[0]?.n);
  };
  return {
    opened: await one("SELECT COUNT(DISTINCT telegram_id) n FROM events WHERE type = 'app_open'"),
    startedRegistration: await one("SELECT COUNT(DISTINCT telegram_id) n FROM events WHERE type = 'register_start'"),
    registered: await one("SELECT COUNT(*) n FROM users WHERE status IN ('registered','deposited')"),
    deposited: await one("SELECT COUNT(*) n FROM users WHERE status = 'deposited'"),
  };
}

/* ---------- vocabulary ---------- */
const TABS = { f: 'Сигналы', h: 'История', a: 'Помощник', p: 'Профиль', s: 'Поддержка' };
const EVENT_CATS = [
  ['all', 'Все'],
  ['visit', 'Заходы'],
  ['nav', 'Навигация'],
  ['signal', 'Сигналы'],
  ['register', 'Регистрация'],
  ['postback', 'Постбеки'],
];
// type -> [category, label, colour]
const EVENT = {
  app_open: ['visit', 'Заход в приложение', 'green'],
  tab_view: ['nav', 'Просмотр вкладки', 'slate'],
  language_change: ['nav', 'Смена языка', 'slate'],
  faq_open: ['nav', 'Открыл FAQ', 'slate'],
  register_modal_step: ['register', 'Шаг регистрации', 'amber'],
  register_start: ['register', 'Начал регистрацию', 'amber'],
  signal_request: ['signal', 'Запросил сигнал', 'violet'],
  signal_decision: ['signal', 'Решение по сигналу', 'pink'],
  signal_blocked: ['signal', 'Лимит сигналов исчерпан', 'red'],
  postback_registration: ['postback', 'Постбек: регистрация', 'blue'],
  postback_ftd: ['postback', 'Постбек: первый депозит', 'emerald'],
  postback_deposit: ['postback', 'Постбек: повторный депозит', 'emerald'],
};
function eventMeta(type) {
  if (EVENT[type]) return EVENT[type];
  if (/^postback_.*_unmatched$/.test(type)) return ['postback', 'Постбек без пользователя', 'red'];
  if (type.startsWith('postback_')) return ['postback', 'Постбек: ' + type.slice(9), 'cyan'];
  return ['other', type, 'slate'];
}
const STATUS = {
  new: { label: 'Новый', cls: 'slate', step: 1 },
  registered: { label: 'Зарегистрирован', cls: 'violet', step: 2 },
  deposited: { label: 'Пополнил', cls: 'emerald', step: 3 },
};
const SOURCE = { real: ['real', 'green'], sim: ['sim', 'amber'], app: ['app', 'blue'], unknown: ['unknown', 'slate'] };

/* ---------- small renderers ---------- */
const badge = (text, cls, extra = '') => `<span class="b c-${cls}" ${extra}><i class="dot"></i>${esc(text)}</span>`;
const chip = (text, cls = '') => `<span class="dchip ${cls}">${esc(text)}</span>`;

function parseJson(raw) {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function detailChips(type, raw) {
  const o = parseJson(raw);
  if (!o) return raw ? chip(raw) : '';
  const out = [];
  if (type === 'tab_view') out.push(chip(TABS[o.tab] || o.tab, 'blue'));
  else if (type === 'signal_decision') {
    out.push(o.st === 'ok' ? chip('взял в работу', 'green') : chip('пропустил', 'slate'));
    if (o.asset) out.push(chip(o.asset));
    if (o.tf) out.push(chip(o.tf));
  } else if (type === 'signal_request' || type === 'signal_blocked') {
    if (o.asset) out.push(chip(o.asset));
    if (o.timeframe) out.push(chip(o.timeframe));
  } else if (type === 'register_start') out.push(chip('click_id ' + o.click_id, 'mono'));
  else if (type === 'language_change') out.push(chip(String(o.lang || '').toUpperCase()));
  else {
    for (const [k, v] of Object.entries(o)) {
      if (v === null || v === '') continue;
      out.push(chip(k === 'sum' ? `sum: $${v}` : `${k}: ${v}`, /id/.test(k) ? 'mono' : ''));
    }
  }
  return out.join('');
}

function userCell(u) {
  if (!u.telegram_id) return '<span class="mute">не определён</span>';
  const name = u.first_name || u.username || 'User';
  const hue = (num(u.telegram_id) * 47) % 360;
  return `<div class="user"><span class="ava" style="background:hsl(${hue} 62% 46%)">${esc(String(name).charAt(0).toUpperCase())}</span>
    <div class="uinfo"><b>${esc(name)}${u.label ? ` <span class="b c-amber tiny">${esc(u.label)}</span>` : ''}</b>
    <small>${u.username ? '@' + esc(u.username) + ' · ' : ''}<span class="mono">#${esc(u.telegram_id)}</span></small></div></div>`;
}

function chips(list, counts, active = 'all') {
  return list
    .map(([key, label]) => `<button type="button" class="chip ${key === active ? 'on' : ''}" data-cat="${esc(key)}">${esc(label)} <em>${counts[key] ?? 0}</em></button>`)
    .join('');
}

function panel(id, title, toolbar, head, rows, emptyText) {
  return `<section class="panel" id="${id}" hidden>
  <div class="toolbar">${toolbar}<span class="count"></span></div>
  <div class="tw"><table><thead><tr>${head}</tr></thead><tbody>${rows || ''}</tbody></table>
  ${rows ? '' : `<div class="empty">${esc(emptyText)}</div>`}</div></section>`;
}

export async function renderAdmin(db, _query = {}) {
  const f = await funnel(db);

  const [events] = await db.execute(
    `SELECT e.id, e.ts, e.telegram_id, e.type, e.source, e.details, u.username, u.first_name, u.label
       FROM events e LEFT JOIN users u ON u.telegram_id = e.telegram_id
      ORDER BY e.id DESC LIMIT 500`
  );
  const [users] = await db.execute(
    `SELECT u.*, COALESCE(x.cnt, 0) AS cnt, x.last_open
       FROM users u
       LEFT JOIN (SELECT telegram_id, COUNT(*) AS cnt, MAX(CASE WHEN type = 'app_open' THEN ts END) AS last_open
                    FROM events GROUP BY telegram_id) x ON x.telegram_id = u.telegram_id
      ORDER BY COALESCE(x.last_open, u.last_seen_at) DESC LIMIT 500`
  );
  const [raws] = await db.execute('SELECT * FROM postbacks_raw ORDER BY id DESC LIMIT 100');

  /* --- tab 1: every event --- */
  const catCount = { all: events.length };
  const eventRows = events
    .map((e) => {
      const [cat, label, colour] = eventMeta(e.type);
      catCount[cat] = (catCount[cat] || 0) + 1;
      const [srcText, srcColour] = SOURCE[e.source] || SOURCE.unknown;
      const search = [e.first_name, e.username, e.telegram_id, e.label, label, e.type, e.source, e.details].join(' ').toLowerCase();
      return `<tr data-cat="${cat}" data-search="${esc(search)}">
        <td class="nw">${timeTag(e.ts)}</td>
        <td>${userCell(e)}</td>
        <td>${badge(label, colour, `title="${esc(e.type)}"`)}</td>
        <td>${badge(srcText, srcColour)}</td>
        <td class="det">${detailChips(e.type, e.details)}</td></tr>`;
    })
    .join('');

  /* --- tab 2: users and stages --- */
  const stCount = { all: users.length, new: 0, registered: 0, deposited: 0 };
  const userRows = users
    .map((u) => {
      const st = STATUS[u.status] || STATUS.new;
      stCount[STATUS[u.status] ? u.status : 'new']++;
      const visit = u.last_open || u.last_seen_at;
      const search = [u.first_name, u.username, u.telegram_id, u.label, st.label, u.status, u.trader_id].join(' ').toLowerCase();
      return `<tr data-cat="${esc(STATUS[u.status] ? u.status : 'new')}" data-search="${esc(search)}">
        <td class="nw">${timeTag(visit)}<small class="rel" data-rel="${num(visit)}"></small></td>
        <td>${userCell(u)}</td>
        <td>${badge(st.label, st.cls, `title="${esc(u.status)}"`)}
            <span class="steps s-${st.cls}" title="Этап ${st.step} из 3">${[1, 2, 3].map((n) => `<i class="${n <= st.step ? 'on' : ''}"></i>`).join('')}</span></td>
        <td>${u.trader_id ? `<span class="mono">${esc(u.trader_id)}</span>` : '<span class="mute">—</span>'}</td>
        <td class="num">${num(u.cnt)}</td>
        <td class="nw">${timeTag(u.created_at)}</td></tr>`;
    })
    .join('');

  /* --- tab 3: raw partner postbacks --- */
  const NOTE = { ok: 'green', duplicate: 'amber', unmatched: 'red', no_event: 'slate' };
  const rawRows = raws
    .map((r) => {
      const o = parseJson(r.query) || {};
      const unfilled = typeof o.click_id === 'string' && o.click_id.includes('{');
      const parts = [];
      if (o.event) parts.push(chip('event: ' + o.event, 'blue'));
      if (o.click_id !== undefined) parts.push(unfilled ? chip('click_id: макрос не подставлен', 'red') : chip('click_id: ' + (o.click_id || 'пусто'), o.click_id ? 'mono' : 'red'));
      for (const k of ['trader_id', 'sum', 'country', 'dt', 'src']) if (o[k] !== undefined && o[k] !== '') parts.push(chip(`${k}: ${o[k]}`, k === 'trader_id' ? 'mono' : ''));
      const search = [r.query, r.note, r.ip].join(' ').toLowerCase();
      return `<tr data-cat="${esc(r.note || 'none')}" data-search="${esc(search)}">
        <td class="nw">${timeTag(r.ts)}</td><td class="mono">${esc(r.ip)}</td>
        <td class="det">${parts.join('') || chip(r.query)}</td>
        <td>${badge(r.note || '—', NOTE[r.note] || 'slate')}</td></tr>`;
    })
    .join('');
  const rawCount = { all: raws.length };
  for (const r of raws) rawCount[r.note || 'none'] = (rawCount[r.note || 'none'] || 0) + 1;

  const searchBox = (ph) => `<input class="q" type="search" placeholder="${esc(ph)}" autocomplete="off">`;

  const panels =
    panel('events', 'События', `${searchBox('Поиск по ленте…')}<div class="chips">${chips(EVENT_CATS, catCount)}</div>`,
      '<th>Время</th><th>Пользователь</th><th>Действие</th><th>Источник</th><th>Детали</th>', eventRows, 'Событий пока нет') +
    panel('users', 'Пользователи', `${searchBox('Имя, @username, ID…')}<div class="chips">${chips([['all', 'Все'], ['new', 'Новые'], ['registered', 'Зарегистрированные'], ['deposited', 'Пополнили']], stCount)}</div>`,
      '<th>Последний заход</th><th>Пользователь</th><th>Этап</th><th>Trader ID</th><th>Действий</th><th>Первый заход</th>', userRows, 'Пользователей пока нет') +
    panel('postbacks', 'Постбеки', `${searchBox('Поиск по запросу партнёра…')}<div class="chips">${chips([['all', 'Все'], ['ok', 'ok'], ['duplicate', 'duplicate'], ['unmatched', 'unmatched']], rawCount)}</div>`,
      '<th>Время</th><th>IP</th><th>Что прислал партнёр</th><th>Результат</th>', rawRows, 'Постбеков пока нет');

  const card = (cls, label, value, sub) => `<div class="card k-${cls}"><span>${label}</span><b>${value}</b><small>${sub}</small></div>`;

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Andromeda · Admin</title><style>${CSS}</style></head><body>
<header>
  <h1><span class="logo">A</span> Andromeda AI <small>admin</small></h1>
  <div class="live"><label class="sw"><input type="checkbox" id="auto" checked><span></span>Автообновление</label>
    <button type="button" id="reload" class="btn">Обновить</button><span id="stamp" class="mute"></span></div>
</header>
<div class="funnel">
  ${card('blue', 'Зашли', f.opened, 'уникальных пользователей')}
  ${card('amber', 'Начали регистрацию', f.startedRegistration, pct(f.startedRegistration, f.opened) + ' от зашедших')}
  ${card('violet', 'Зарегистрировались', f.registered, pct(f.registered, f.startedRegistration) + ' от начавших')}
  ${card('green', 'Пополнили', f.deposited, pct(f.deposited, f.registered) + ' от зарегистрированных')}
</div>
<nav class="tabs">
  <button type="button" class="tab" data-tab="events">📡 Все события <em>${events.length}</em></button>
  <button type="button" class="tab" data-tab="users">👥 Пользователи <em>${users.length}</em></button>
  <button type="button" class="tab" data-tab="postbacks">🔁 Постбеки <em>${raws.length}</em></button>
</nav>
${panels}
<footer class="mute">${events.length >= 500 ? 'В ленте последние 500 событий' : 'В ленте все события'} · время указано в вашем часовом поясе</footer>
<script>${CLIENT_JS}</script></body></html>`;
}

/* ---------- styles ---------- */
const CSS = `
:root{--bg:#0a1020;--card:#111b34;--card2:#16223f;--line:#22305a;--text:#e8eefc;--mute:#8396c2;
--blue:#5b9bff;--cyan:#22d3ee;--violet:#a78bfa;--pink:#f472b6;--amber:#fbbf24;--green:#34d399;--red:#f87171;--slate:#9fb0d6}
*{box-sizing:border-box}[hidden]{display:none!important}
body{margin:0;padding:20px 24px 40px;color:var(--text);font:13px/1.45 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;
background:radial-gradient(1100px 520px at 8% -12%,#17275a 0%,transparent 60%),radial-gradient(900px 460px at 100% 0,#241a63 0%,transparent 55%),var(--bg);min-height:100vh}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:18px}
h1{margin:0;font-size:20px;display:flex;align-items:center;gap:10px}h1 small{font-size:11px;color:var(--mute);text-transform:uppercase;letter-spacing:.12em;border:1px solid var(--line);padding:2px 8px;border-radius:999px}
.logo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,var(--blue),var(--violet));font-weight:800}
.live{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.btn{background:var(--card2);color:var(--text);border:1px solid var(--line);padding:6px 12px;border-radius:9px;cursor:pointer;font:inherit}.btn:hover{border-color:var(--blue)}
.sw{display:flex;align-items:center;gap:8px;cursor:pointer;color:var(--mute)}.sw input{display:none}
.sw span{width:34px;height:19px;border-radius:99px;background:#26345f;position:relative;transition:.2s}
.sw span:after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#fff;transition:.2s}
.sw input:checked+span{background:var(--green)}.sw input:checked+span:after{left:17px}
.funnel{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:20px}
.card{background:linear-gradient(180deg,var(--card2),var(--card));border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.card:before{content:"";position:absolute;left:0;right:0;top:0;height:3px;background:var(--c)}
.card span{color:var(--mute);font-size:12px}.card b{display:block;font-size:30px;line-height:1.15;margin:4px 0 2px;color:var(--c)}.card small{color:var(--mute)}
.k-blue{--c:var(--blue)}.k-amber{--c:var(--amber)}.k-violet{--c:var(--violet)}.k-green{--c:var(--green)}
.tabs{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.tab{background:transparent;color:var(--mute);border:1px solid var(--line);border-radius:11px;padding:9px 15px;cursor:pointer;font:600 13px inherit;font-family:inherit}
.tab em,.chip em{font-style:normal;background:rgba(255,255,255,.08);border-radius:99px;padding:1px 7px;margin-left:5px;font-size:11px}
.tab.on{color:#fff;background:linear-gradient(135deg,#2c4fd8,#6d3fe0);border-color:transparent;box-shadow:0 6px 20px rgba(76,86,240,.35)}
.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.q{background:var(--card);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:8px 12px;min-width:240px;font:inherit}.q:focus{outline:none;border-color:var(--blue)}
.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{background:var(--card);color:var(--mute);border:1px solid var(--line);border-radius:99px;padding:5px 11px;cursor:pointer;font:inherit}
.chip.on{color:#fff;border-color:var(--blue);background:rgba(91,155,255,.18)}.count{margin-left:auto;color:var(--mute)}
.tw{overflow:auto;max-height:calc(100vh - 360px);min-height:160px;border:1px solid var(--line);border-radius:14px;background:rgba(17,27,52,.82);backdrop-filter:blur(4px)}
table{border-collapse:collapse;width:100%}th,td{padding:10px 14px;text-align:left;vertical-align:middle;border-bottom:1px solid rgba(34,48,90,.7)}
th{position:sticky;top:0;z-index:2;background:#15224a;color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.07em}
tbody tr:hover td{background:rgba(91,155,255,.06)}.nw{white-space:nowrap}.num{text-align:right;font-variant-numeric:tabular-nums}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.mute{color:var(--mute)}.empty{padding:36px;text-align:center;color:var(--mute)}
.user{display:flex;align-items:center;gap:10px}.ava{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-weight:700;color:#fff;flex:none}
.uinfo b{display:block;font-weight:600}.uinfo small,td small{display:block;color:var(--mute);font-size:11.5px}
.b{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:11.5px;font-weight:600;border:1px solid;white-space:nowrap}
.b .dot{width:6px;height:6px;border-radius:50%;background:currentColor}.tiny{font-size:10px;padding:1px 7px}
.c-green{color:#34d399;background:rgba(52,211,153,.12);border-color:rgba(52,211,153,.35)}
.c-emerald{color:#052e22;background:linear-gradient(135deg,#34d399,#6ee7b7);border-color:transparent}
.c-blue{color:#7db0ff;background:rgba(91,155,255,.14);border-color:rgba(91,155,255,.4)}
.c-violet{color:#c4b5fd;background:rgba(167,139,250,.14);border-color:rgba(167,139,250,.4)}
.c-pink{color:#f9a8d4;background:rgba(244,114,182,.13);border-color:rgba(244,114,182,.4)}
.c-amber{color:#fcd34d;background:rgba(251,191,36,.12);border-color:rgba(251,191,36,.38)}
.c-red{color:#fca5a5;background:rgba(248,113,113,.13);border-color:rgba(248,113,113,.42)}
.c-cyan{color:#67e8f9;background:rgba(34,211,238,.12);border-color:rgba(34,211,238,.38)}
.c-slate{color:#b6c3e3;background:rgba(159,176,214,.1);border-color:rgba(159,176,214,.28)}
.det{max-width:520px}.dchip{display:inline-block;margin:2px 5px 2px 0;padding:2px 8px;border-radius:7px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:12px;color:#d3ddf5;word-break:break-all}
.dchip.mono{font-family:ui-monospace,Menlo,monospace;font-size:11.5px}.dchip.blue{color:#7db0ff;background:rgba(91,155,255,.12)}
.dchip.green{color:#34d399;background:rgba(52,211,153,.12)}.dchip.slate{color:#9fb0d6}.dchip.red{color:#fca5a5;background:rgba(248,113,113,.14)}
.steps{display:inline-flex;gap:3px;margin-left:10px;vertical-align:middle}.steps i{width:16px;height:5px;border-radius:3px;background:#26345f}
.steps.s-slate i.on{background:var(--slate)}.steps.s-violet i.on{background:var(--violet)}.steps.s-emerald i.on{background:var(--green)}
footer{margin-top:14px;font-size:12px}
`;

/* ---------- browser script (no template literals on purpose: this sits inside a server-side template) ---------- */
const CLIENT_JS = `
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
  function get(k,d){try{var v=sessionStorage.getItem('adm:'+k);return v===null?d:JSON.parse(v)}catch(e){return d}}
  function set(k,v){try{sessionStorage.setItem('adm:'+k,JSON.stringify(v))}catch(e){}}
  var fmt=new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
  $$('time[data-ts]').forEach(function(t){var d=new Date(+t.getAttribute('data-ts'));t.textContent=fmt.format(d);t.title=d.toISOString()});
  function ago(ts){if(!ts)return '';var s=Math.max(0,Math.round((Date.now()-ts)/1000));
    if(s<60)return 'только что';var m=Math.floor(s/60);if(m<60)return m+' мин назад';
    var h=Math.floor(m/60);if(h<24)return h+' ч назад';return Math.floor(h/24)+' дн назад'}
  function rel(){$$('[data-rel]').forEach(function(e){e.textContent=ago(+e.getAttribute('data-rel'))})}
  rel();setInterval(rel,30000);
  $('#stamp').textContent='обновлено '+new Date().toLocaleTimeString('ru-RU');

  var tabs=$$('.tab'),panels=$$('.panel');
  function showTab(id){if(!$('#'+id))id='events';
    tabs.forEach(function(t){t.classList.toggle('on',t.getAttribute('data-tab')===id)});
    panels.forEach(function(p){p.hidden=p.id!==id});
    set('tab',id);try{history.replaceState(null,'','#'+id)}catch(e){}}
  tabs.forEach(function(t){t.addEventListener('click',function(){showTab(t.getAttribute('data-tab'))})});
  showTab((location.hash||'').replace('#','')||get('tab','events'));

  panels.forEach(function(p){
    var q=$('.q',p),chips=$$('.chip',p),rows=$$('tbody tr',p),count=$('.count',p);
    var cat=get(p.id+':cat','all');q.value=get(p.id+':q','');
    function apply(){var term=q.value.trim().toLowerCase(),n=0;
      rows.forEach(function(r){var ok=(cat==='all'||r.getAttribute('data-cat')===cat)&&(!term||(r.getAttribute('data-search')||'').indexOf(term)!==-1);
        r.hidden=!ok;if(ok)n++});
      chips.forEach(function(c){c.classList.toggle('on',c.getAttribute('data-cat')===cat)});
      count.textContent='Показано '+n+' из '+rows.length}
    chips.forEach(function(c){c.addEventListener('click',function(){cat=c.getAttribute('data-cat');set(p.id+':cat',cat);apply()})});
    q.addEventListener('input',function(){set(p.id+':q',q.value);apply()});
    apply()});

  var auto=$('#auto');auto.checked=get('auto',true);
  auto.addEventListener('change',function(){set('auto',auto.checked)});
  function reload(){set('y',window.scrollY);location.reload()}
  $('#reload').addEventListener('click',reload);
  setInterval(function(){if(auto.checked&&document.activeElement&&document.activeElement.tagName!=='INPUT')reload()},15000);
  var y=get('y',0);if(y)window.scrollTo(0,y);
})();
`;
