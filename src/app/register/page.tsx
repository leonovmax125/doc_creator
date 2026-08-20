'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PasswordField } from '@/components/password-field';

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, inviteCode }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Не удалось зарегистрироваться. Попробуйте ещё раз.');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card animate-in w-full max-w-sm p-6 shadow-[var(--shadow)]">
        <h1 className="mb-6 text-center text-2xl font-semibold text-fg">
          Регистрация
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="label">
              Имя
            </label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input-field"
            />
          </div>

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

          <PasswordField
            id="password"
            label="Пароль"
            value={password}
            onChange={setPassword}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <PasswordField
            id="confirmPassword"
            label="Повтор пароля"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
            minLength={6}
            autoComplete="new-password"
          />

          <div>
            <label htmlFor="inviteCode" className="label">
              Код приглашения
            </label>
            <input
              id="inviteCode"
              type="text"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="input-field"
            />
          </div>

          {error && (
            <p className="rounded-lg px-3 py-2 text-sm text-[var(--danger)] bg-[var(--danger-soft)]">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary w-full"
          >
            {loading ? 'Регистрируем…' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-medium text-fg underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  );
}
