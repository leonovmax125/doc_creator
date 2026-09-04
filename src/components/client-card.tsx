'use client';

import { useState } from 'react';
import Link from 'next/link';
import { RequisitesEditor, type Requisite } from './requisites-editor';
import { CASE_STATUS_LABELS, CASE_STATUS_BADGE, type CaseStatus } from '@/lib/case-status';

type Client = {
  id: string;
  name: string;
  country: string | null;
  contact_person: string | null;
  notes: string | null;
};

type CaseRow = { id: string; title: string; status: CaseStatus; created_at: string };

export function ClientCard({
  client,
  requisites,
  cases,
}: {
  client: Client;
  requisites: Requisite[];
  cases: CaseRow[];
}) {
  const [name, setName] = useState(client.name);
  const [country, setCountry] = useState(client.country ?? '');
  const [contactPerson, setContactPerson] = useState(client.contact_person ?? '');
  const [notes, setNotes] = useState(client.notes ?? '');

  async function persist(patch: Partial<Client>) {
    await fetch(`/api/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Название</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={(e) => persist({ name: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Страна</label>
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onBlur={(e) => persist({ country: e.target.value })}
              className="input-field"
            />
          </div>
          <div>
            <label className="label">Контактное лицо</label>
            <input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              onBlur={(e) => persist({ contact_person: e.target.value })}
              className="input-field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Заметки</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={(e) => persist({ notes: e.target.value })}
              rows={2}
              className="input-field"
            />
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-medium text-fg">Реквизиты</h2>
        <RequisitesEditor
          ownerType="client"
          ownerId={client.id}
          initialRequisites={requisites}
          onPresetApplied={(countryLabel) => {
            setCountry(countryLabel);
            persist({ country: countryLabel });
          }}
        />
      </div>

      <div className="card p-4">
        <h2 className="mb-2 text-sm font-medium text-fg">Договоры</h2>
        {cases.length === 0 ? (
          <p className="text-sm text-muted">Пока нет договоров с этим клиентом.</p>
        ) : (
          <div className="space-y-2">
            {cases.map((c) => (
              <Link
                key={c.id}
                href={`/dashboard/contracts/${c.id}`}
                className="flex items-center justify-between rounded-lg border border-border p-3 text-sm hover:border-border"
              >
                <span className="min-w-0 truncate text-fg">{c.title}</span>
                <span
                  className={`ml-3 shrink-0 rounded-full px-2 py-1 text-xs font-medium ${CASE_STATUS_BADGE[c.status]}`}
                >
                  {CASE_STATUS_LABELS[c.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
