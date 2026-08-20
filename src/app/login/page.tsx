'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordField } from '@/components/password-field';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Не удалось войти. Попробуйте ещё раз.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card animate-in w-full max-w-sm p-6 shadow-[var(--shadow)]">
        <h1 className="mb-6 text-center text-2xl font-semibold text-fg">Вход</h1>

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

          <div>
            <PasswordField
              id="password"
              label="Пароль"
              value={password}
              onChange={setPassword}
              required
              autoComplete="current-password"
            />
            <p className="mt-1 text-right">
              <Link href="/forgot-password" className="text-xs text-accent hover:underline">
                Забыли пароль?
              </Link>
            </p>
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Нет аккаунта?{' '}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Зарегистрироваться по коду приглашения
          </Link>
        </p>
      </div>
    </main>
  );
}
