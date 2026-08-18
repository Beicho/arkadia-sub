# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S arkadia && adduser -S arkadia -G arkadia
COPY --from=build --chown=arkadia:arkadia /app/.next/standalone ./
COPY --from=build --chown=arkadia:arkadia /app/.next/static ./.next/static
COPY --from=build --chown=arkadia:arkadia /app/public ./public
USER arkadia
EXPOSE 3000
CMD ["node", "server.js"]

# 工具档:跑数据库迁移(宿主机无需 node)
FROM build AS migrate-tools
CMD ["npx", "drizzle-kit", "push", "--force"]
