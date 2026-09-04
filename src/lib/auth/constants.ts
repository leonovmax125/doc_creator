// Имя cookie сессии. В отдельном модуле без серверных зависимостей, чтобы его
// можно было импортировать и в middleware (Edge), и в серверном коде (Node).
export const SESSION_COOKIE = 'doc_session';
