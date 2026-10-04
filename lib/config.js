function parseTestUsers(raw) {
  const map = {};
  for (const part of (raw || '').split(',')) {
    const [id, ...label] = part.split(':');
    if (id && label.length) map[id.trim()] = label.join(':').trim();
  }
  return map;
}

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 3000),
    botToken: env.BOT_TOKEN || '',
    devBypass: env.NODE_ENV !== 'production' && env.DEV_BYPASS_AUTH === '1',
    freeLimit: Number(env.FREE_LIMIT || 3),
    dayTz: env.DAY_TZ || 'UTC',
    postbackSecret: env.POSTBACK_SECRET || '',
    adminKey: env.ADMIN_KEY || '',
    partnerLinkTemplate: env.PARTNER_LINK_TEMPLATE || '',
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    enableSim: env.ENABLE_SIM === '1',
    dbPath: env.DB_PATH || './data/app.db',
    testUsers: parseTestUsers(env.TEST_USERS),
  };
}
