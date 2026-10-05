import mysql from 'mysql2/promise';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  telegram_id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  first_name VARCHAR(255),
  label VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'new',
  trader_id VARCHAR(255),
  created_at BIGINT NOT NULL,
  last_seen_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS clicks (
  click_id VARCHAR(255) PRIMARY KEY,
  telegram_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS signal_uses (
  telegram_id BIGINT NOT NULL,
  day VARCHAR(50) NOT NULL,
  n INT NOT NULL DEFAULT 0,
  PRIMARY KEY (telegram_id, day)
);

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ts BIGINT NOT NULL,
  telegram_id BIGINT,
  type VARCHAR(100) NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'app',
  details TEXT
);

CREATE TABLE IF NOT EXISTS postbacks_raw (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ts BIGINT NOT NULL,
  ip VARCHAR(100),
  query TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS postback_dedup (
  dedup_key VARCHAR(255) PRIMARY KEY,
  ts BIGINT NOT NULL
);
`;

export function openDb(config) {
  // Создаем пул подключений MySQL
  const pool = mysql.createPool({
    host: config.dbHost,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    port: config.dbPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Автоматически создаем таблицы при старте
  pool.getConnection().then(async (connection) => {
    try {
      // Разбиваем схему по точкам с запятой и выполняем запросы последовательно
      const statements = SCHEMA.split(';').map(s => s.trim()).filter(Boolean);
      for (const statement of statements) {
        await connection.query(statement);
      }
      console.log('Таблицы MySQL успешно инициализированы.');
    } catch (err) {
      console.error('Ошибка создания таблиц в MySQL:', err);
    } finally {
      connection.release();
    }
  }).catch(err => {
    console.error('Ошибка подключения к MySQL в openDb:', err.message);
  });

  return pool;
}
