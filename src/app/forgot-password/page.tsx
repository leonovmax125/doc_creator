'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    if (!response.ok) {
      setError('Не удалось отправить письмо. Попробуйте ещё раз.');
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card animate-in w-full max-w-sm p-6 shadow-[var(--shadow)]">
        <h1 className="mb-2 text-center text-2xl font-semibold text-fg">Восстановление пароля</h1>

        {sent ? (
          <div className="mt-4 space-y-4">
            <p
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-fg)' }}
            >
              Если такой аккаунт существует, мы отправили на {email} письмо со ссылкой для смены
              пароля. Проверьте почту (и папку «Спам»).
            </p>
            <Link href="/login" className="btn btn-primary w-full">
              Вернуться ко входу
            </Link>
          </div>
        ) : (
          <>
            <p className="mb-6 text-center text-sm text-muted">
              Укажите почту — пришлём ссылку для установки нового пароля.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="label">
                  Почта
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                />
              </div>

              {error && (
                <p
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
                >
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full">
                {loading ? 'Отправляем…' : 'Отправить ссылку'}
              </button>
            </form>

            <p className="mt-4 text-center text-sm text-muted">
              <Link href="/login" className="font-medium text-accent hover:underline">
                Вспомнили? Войти
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
