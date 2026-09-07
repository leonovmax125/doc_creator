-- Выбор модели Gemini пользователем (Настройки → Ключи ИИ).
-- Пусто/NULL — используется модель по умолчанию (Flash) в коде.
alter table public.user_settings add column if not exists gemini_model text;
