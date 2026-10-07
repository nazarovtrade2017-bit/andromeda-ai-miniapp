export async function logEvent(ctx, { telegram_id = null, type, source = 'app', details = null }) {
  const ts = Date.now();
  const payload = details == null ? null : JSON.stringify(details).slice(0, 500);
  
  let user = null;

  try {
    if (ctx && ctx.db) {
      // 1. Записываем само событие в таблицу events в MySQL
      await ctx.db.execute(
        'INSERT INTO events (ts, telegram_id, type, source, details) VALUES (?, ?, ?, ?, ?)',
        [ts, telegram_id, type, source, payload]
      );

      // 2. Достаем данные пользователя из таблицы users для красивого лога
      if (telegram_id) {
        const [rows] = await ctx.db.execute(
          'SELECT username, label FROM users WHERE telegram_id = ?',
          [telegram_id]
        );
        user = rows[0];
      }
    }
  } catch (err) {
    console.error('[DB Insert Error in logEvent]:', err.message);
  }

  // 3. Вывод в консоль Railway (чтобы вы по-прежнему видели логи)
  const entry = { ts, telegram_id, username: user?.username ?? null, label: user?.label ?? null, type, source, details };
  if (!ctx?.quiet) console.log('[event]', JSON.stringify(entry));

  for (const sink of ctx?.sinks || []) {
    Promise.resolve()
      .then(() => sink(entry))
      .catch((err) => console.error('[sink error]', err.message));
  }
  
  return entry;
}
