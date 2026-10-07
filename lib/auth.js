import crypto from 'node:crypto';

/**
 * Validates Telegram WebApp initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * Returns the Telegram user object, or null if the signature is wrong / data is too old.
 */
export function validateInitData(initData, botToken, maxAgeSec = 3600) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest();
  const given = Buffer.from(hash, 'hex');
  if (!crypto.timingSafeEqual(expected, given)) return null;

  const age = Math.floor(Date.now() / 1000) - Number(params.get('auth_date'));
  if (!Number.isFinite(age) || age > maxAgeSec || age < -60) return null;

  try {
    const user = JSON.parse(params.get('user') || 'null');
    return user && Number.isInteger(user.id) ? user : null;
  } catch {
    return null;
  }
}

/** Express middleware: expects header  Authorization: tma <initData>  */
export function makeAuth(config) {
  return (req, res, next) => {
    if (config.devBypass && req.get('x-dev-user')) {
      const [id, username] = req.get('x-dev-user').split(':');
      if (Number.isInteger(Number(id))) {
        req.tgUser = { id: Number(id), username: username || null, first_name: username || 'Dev' };
        return next();
      }
    }
    const header = req.get('authorization') || '';
    const initData = header.startsWith('tma ') ? header.slice(4) : '';
    const user = validateInitData(initData, config.botToken);
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    req.tgUser = user;
    next();
  };
}
