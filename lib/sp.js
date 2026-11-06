import crypto from 'node:crypto';

/**
 * GET /sp/status?tg=<telegram_id>&key=<SP_KEY>
 * Called by the SendPulse "Запрос API" block. Returns flat JSON so every field can be mapped to a contact variable.
 * All flags are 0/1 numbers; status is new | registered | deposited.
 */
export async function spStatus(ctx, query) {
  const want = Buffer.from(ctx.config.spKey || '');
  const given = Buffer.from(String(query.key ?? ''));
  if (!want.length || given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    return { status: 403, body: { error: 'forbidden' } };
  }

  const tg = Number(query.tg);
  if (!Number.isSafeInteger(tg) || tg <= 0) return { status: 400, body: { error: 'bad tg' } };

  const [users] = await ctx.db.execute('SELECT status FROM users WHERE telegram_id = ?', [tg]);
  const [rows] = await ctx.db.execute(
    `SELECT type, COUNT(*) AS n FROM events
      WHERE telegram_id = ? AND type IN ('app_open','signal_request','register_start','deposit_click')
      GROUP BY type`,
    [tg]
  );
  const n = Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
  const status = users[0]?.status ?? 'new';

  return {
    status: 200,
    body: {
      found: users.length ? 1 : 0,
      status,
      opened: n.app_open ? 1 : 0,
      signals: n.signal_request || 0,
      reg_started: n.register_start ? 1 : 0,
      dep_clicked: n.deposit_click ? 1 : 0,
      registered: status === 'registered' || status === 'deposited' ? 1 : 0,
      deposited: status === 'deposited' ? 1 : 0,
    },
  };
}
