/**
 * Single place where every business event is recorded.
 * Sinks (Google Sheets, Telegram notification) plug in here later without touching handlers.
 */
export async function logEvent(ctx, { telegram_id = null, type, source = 'app', details = null }) {
  const ts = Date.now();
  const payload = details == null ? null : JSON.stringify(details).slice(0, 500);
  
  await ctx.db.execute(
    'INSERT INTO events(ts, telegram_id, type, source, details) VALUES (?, ?, ?, ?, ?)',
    [ts, telegram_id, type, source, payload]
  );

  let user = null;
  if (telegram_id) {
    const [rows] = await ctx.db.execute(
      'SELECT username, label FROM users WHERE telegram_id = ?',
      [telegram_id]
    );
    user = rows[0];
  }

  const entry = { ts, telegram_id, username: user?.username ?? null, label: user?.label ?? null, type, source, details };
  if (!ctx.quiet) console.log('[event]', JSON.stringify(entry));

  for (const sink of ctx.sinks || []) {
    Promise.resolve()
      .then(() => sink(entry))
      .catch((err) => console.error('[sink error]', err.message));
  }
  return entry;
}
