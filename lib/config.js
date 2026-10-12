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
    freeLimit: Number(env.FREE_LIMIT || 3),            // signals/day before registration
    regFreeLimit: Number(env.REG_FREE_LIMIT || 5),     // signals/day after registration, before the first deposit
    minDeposit: Number(env.MIN_DEPOSIT || 11),
    recDeposit: Number(env.REC_DEPOSIT || 25),
    promoCode: env.PROMO_CODE || 'SIG10',
    promoBonusPct: Number(env.PROMO_BONUS_PCT || 60),
    dayTz: env.DAY_TZ || 'UTC',
    postbackSecret: env.POSTBACK_SECRET || '',
    adminKey: env.ADMIN_KEY || '',
    partnerLinkTemplate: env.PARTNER_LINK_TEMPLATE || '',
    // Where the "top up" button leads. Falls back to the partner link, then to the simulator.
    depositLinkTemplate: env.DEPOSIT_LINK_TEMPLATE || '',
    publicUrl: (env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, ''),
    enableSim: env.ENABLE_SIM === '1',
    // GET /admin/demo-reset - puts a user back to "new" so the funnel can be shown again on stage. Off by default.
    enableDemoTools: env.ENABLE_DEMO_TOOLS === '1',
    
    // Параметры для подключения к MySQL (поддерживают Railway и кастомные переменные)
    dbHost: env.MYSQLHOST || env.DB_HOST || 'localhost',
    dbUser: env.MYSQLUSER || env.DB_USER || 'root',
    dbPassword: env.MYSQLPASSWORD || env.DB_PASSWORD || '',
    dbName: env.MYSQLDATABASE || env.DB_NAME || 'railway',
    dbPort: Number(env.MYSQLPORT || env.DB_PORT || 3306),

    testUsers: parseTestUsers(env.TEST_USERS),
  };
}
