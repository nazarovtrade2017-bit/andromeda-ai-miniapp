/**
 * Single place where every business event is recorded.
 * Sinks (Google Sheets, Telegram notification) plug in here later without touching handlers.
 */
export function logEvent(ctx, { telegram_id = null, type, source = 'app', details = null }) {
  const ts = Date.now();
  const payload = details == null ? null : JSON.stringify(details).slice(0, 500);
  ctx.db
    .prepare('INSERT INTO events(ts, telegram_id, type, source, details) VALUES (?,?,?,?,?)')
    .run(ts, telegram_id, type, source, payload);

  const user = telegram_id
    ? ctx.db.prepare('SELECT username, label FROM users WHERE telegram_id = ?').get(telegram_id)
    : null;
  const entry = { ts, telegram_id, username: user?.username ?? null, label: user?.label ?? null, type, source, details };
  if (!ctx.quiet) console.log('[event]', JSON.stringify(entry));

  for (const sink of ctx.sinks || []) {
    Promise.resolve()
      .then(() => sink(entry))
      .catch((err) => console.error('[sink error]', err.message));
  }
  return entry;
}
