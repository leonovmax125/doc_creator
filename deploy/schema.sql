-- ============================================================================
-- Схема базы данных для self-hosted версии (свой Postgres на VPS, без Supabase).
--
-- Отличия от Supabase-версии (supabase/migrations/*):
--   * нет auth.users — учётные данные лежат в нашей таблице users;
--   * нет RLS и security-definer функций — доступ к чужим данным закрывает
--     КОД приложения (каждый запрос ограничен user_id текущей сессии);
--   * коды приглашения проверяются/гасятся в коде, а не в SQL-функциях;
--   * файлы хранятся на диске сервера, а не в Supabase Storage.
--
-- Применение: psql "$DATABASE_URL" -f deploy/schema.sql
-- Скрипт идемпотентный — повторный запуск не ломает уже созданное.
-- ============================================================================

-- gen_random_uuid() встроена в Postgres 13+. На всякий случай включаем pgcrypto.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Пользователи (заменяют auth.users + profiles одной таблицей).
-- password_hash — формат "scrypt$<salt_hex>$<hash_hex>" (см. src/lib/auth/password.ts).
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  full_name text not null default '',
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Сессии входа. Cookie хранит непубличный token; строка живёт до expires_at.
create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_id_idx on sessions (user_id);

-- Одноразовые токены для восстановления пароля по почте.
create table if not exists password_reset_tokens (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists password_reset_user_id_idx on password_reset_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Коды приглашения (закрытая регистрация).
-- ---------------------------------------------------------------------------
create table if not exists invite_codes (
  code text primary key,
  is_used boolean not null default false,
  used_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Своя организация пользователя.
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references users (id) on delete cascade,
  name text not null default '',
  country text,
  logo_path text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Клиенты.
-- ---------------------------------------------------------------------------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  country text,
  contact_person text,
  notes text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Гибкие реквизиты (общие для организации и клиентов).
-- owner_id полиморфно ссылается на organizations.id ИЛИ clients.id —
-- владение проверяет код приложения при каждом запросе.
-- ---------------------------------------------------------------------------
create table if not exists requisites (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('organization', 'client')),
  owner_id uuid not null,
  field_key text not null,
  field_label text not null,
  field_value text not null default '',
  sort_order int not null default 0
);
create index if not exists requisites_owner_idx on requisites (owner_type, owner_id);

-- ---------------------------------------------------------------------------
-- Подписи и печати (файлы на диске).
-- ---------------------------------------------------------------------------
create table if not exists stamps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  type text not null check (type in ('signature', 'stamp')),
  file_path text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Шаблоны договоров.
-- ---------------------------------------------------------------------------
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  category text,
  source_file_path text not null,
  blocks jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  doc_styles jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Дела и версии договоров.
-- ---------------------------------------------------------------------------
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  title text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'signed', 'archived')),
  created_at timestamptz not null default now()
);
create index if not exists cases_client_id_idx on cases (client_id);
create index if not exists cases_user_id_idx on cases (user_id);

create table if not exists contract_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases (id) on delete cascade,
  version_number int not null,
  mode text not null default 'strict' check (mode in ('strict', 'assisted', 'generative')),
  template_id uuid references templates (id) on delete set null,
  blocks jsonb not null default '[]'::jsonb,
  data jsonb not null default '{}'::jsonb,
  docx_path text,
  created_at timestamptz not null default now(),
  unique (case_id, version_number)
);
create index if not exists contract_versions_case_id_idx on contract_versions (case_id);

-- ---------------------------------------------------------------------------
-- Библиотека материалов.
-- ---------------------------------------------------------------------------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  name text not null,
  type text not null default 'other' check (type in ('program', 'service', 'appendix', 'other')),
  content_text text not null default '',
  file_path text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists materials_user_id_idx on materials (user_id);

-- ---------------------------------------------------------------------------
-- История чата с ИИ внутри версии договора.
-- ---------------------------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references contract_versions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_version_id_idx on chat_messages (version_id);

-- ---------------------------------------------------------------------------
-- Личные настройки пользователя (ключ Gemini).
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  user_id uuid primary key references users (id) on delete cascade,
  gemini_api_key text,
  updated_at timestamptz not null default now()
);
