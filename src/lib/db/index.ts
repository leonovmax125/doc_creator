import postgres from 'postgres';

// Единое подключение к нашему Postgres на VPS (заменяет Supabase БД).
// Строка подключения — в DATABASE_URL, например:
//   postgres://doc:пароль@localhost:5432/doc_creator
//
// В dev Next.js перезагружает модули — держим один пул на процесс через globalThis,
// иначе при HMR наплодятся соединения.

const globalForDb = globalThis as unknown as { __sql?: ReturnType<typeof postgres> };

function createSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Не задан DATABASE_URL — укажите строку подключения к Postgres');
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    // На локальном/внутреннем Postgres TLS обычно не нужен; включите при внешнем.
    ssl: process.env.DATABASE_SSL === 'true' ? 'require' : false,
  });
}

export const sql = globalForDb.__sql ?? createSql();
if (process.env.NODE_ENV !== 'production') globalForDb.__sql = sql;
