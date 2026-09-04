'use client';

import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { PasswordField } from '@/components/password-field';

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setLoading(true);
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setError(data?.error ?? 'Не удалось сменить пароль. Попробуйте ещё раз.');
      return;
    }

    setDone(true);
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1200);
  }

  if (!token) {
    return (
      <div className="space-y-4">
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          Ссылка неполная — откройте её целиком из письма. Если не получается,
          запросите новое письмо.
        </p>
        <Link href="/forgot-password" className="btn btn-primary w-full">
          Запросить новое письмо
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <p
        className="rounded-lg px-3 py-2 text-sm"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-soft-fg)' }}
      >
        Пароль обновлён. Входим…
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PasswordField
        id="password"
        label="Новый пароль"
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

      {error && (
        <p
          className="rounded-lg px-3 py-2 text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
        >
          {error}{' '}
          <Link href="/forgot-password" className="font-medium underline">
            Запросить снова
          </Link>
        </p>
      )}

      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? 'Сохраняем…' : 'Сохранить пароль'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="card animate-in w-full max-w-sm p-6 shadow-[var(--shadow)]">
        <h1 className="mb-6 text-center text-2xl font-semibold text-fg">Новый пароль</h1>
        <Suspense fallback={<p className="text-center text-sm text-muted">Загрузка…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
