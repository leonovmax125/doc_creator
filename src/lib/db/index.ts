import postgres from 'postgres';

// Единое подключение к нашему Postgres на VPS (заменяет Supabase БД).
// Строка подключения — в DATABASE_URL, например:
//   postgres://doc:пароль@localhost:5432/doc_creator
//
// Подключение ЛЕНИВОЕ: реальный клиент создаётся при первом запросе, а не при
// импорте модуля. Иначе `next build` (который импортирует модули маршрутов,
// чтобы собрать метаданные) падал бы из-за отсутствия DATABASE_URL на сборке.
//
// В dev Next.js перезагружает модули — держим один пул на процесс через
// globalThis, иначе при HMR наплодятся соединения.

type Sql = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as { __sql?: Sql };

function getSql(): Sql {
  if (globalForDb.__sql) return globalForDb.__sql;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Не задан DATABASE_URL — укажите строку подключения к Postgres');

  const client = postgres(url, {
    max: 10,
    idle_timeout: 20,
    // На локальном/внутреннем Postgres TLS обычно не нужен; включите при внешнем.
    ssl: process.env.DATABASE_SSL === 'true' ? 'require' : false,
  });
  globalForDb.__sql = client;
  return client;
}

// Прокси: ведёт себя как функция-тег `sql\`...\`` и как объект (`sql.json`,
// `sql.begin`, `sql(...)`), но создаёт настоящее соединение только при первом
// обращении.
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSql() as any)(...args);
  },
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (getSql() as any)[prop];
    return typeof value === 'function' ? value.bind(getSql()) : value;
  },
}) as Sql;
