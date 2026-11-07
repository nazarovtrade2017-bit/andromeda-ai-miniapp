const BASE = 'https://api.sendpulse.com/telegram';

async function spCall(ctx, method, path, body) {
  const key = ctx.config.spApiKey;
  if (!key) throw new Error('SP_API_KEY not set');
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`SendPulse ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 200) }; }
}

// Find a contact by Telegram id. Returns the contact object or null.
export async function spFindContact(ctx, tg) {
  const q = new URLSearchParams({ bot_id: ctx.config.spBotId, telegram_id: String(tg) });
  const r = await spCall(ctx, 'GET', `/contacts/getByTelegramId?${q}`);
  const c = Array.isArray(r.data) ? r.data[0] : r.data;
  return c || null;
}

export function contactIdOf(c) {
  return c ? c.id || c._id || null : null;
}

export function spRunFlow(ctx, contactId, flowId) {
  return spCall(ctx, 'POST', '/flows/run', { contact_id: contactId, flow_id: flowId });
}

export function spSetTag(ctx, contactId, tag) {
  return spCall(ctx, 'POST', '/contacts/setTag', { contact_id: contactId, tags: [tag] });
}
