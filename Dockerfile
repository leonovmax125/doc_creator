# Многоступенчатая сборка Next.js для VPS (standalone-режим).
# Итоговый образ маленький: только мини-сервер Next и нужные зависимости.

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Путь /app — ASCII, поэтому сборка Turbopack проходит без проблем.
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Файлы пользователей (шаблоны, подписи, готовые .docx) — на смонтированном томе.
ENV STORAGE_DIR=/data/storage

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

RUN mkdir -p /data/storage && chown -R nextjs:nodejs /data
USER nextjs

EXPOSE 3000
CMD ["node", "server.js"]
