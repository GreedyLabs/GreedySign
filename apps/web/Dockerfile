FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# workspace 루트 메타
COPY pnpm-workspace.yaml ./
COPY package.json ./

# workspace 패키지 manifest 전부 (workspace:* 해석용)
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --no-frozen-lockfile

# shared 스키마 먼저 빌드 (web 번들이 런타임에 import 한다)
COPY packages/shared ./packages/shared
RUN pnpm --filter @greedylabs/greedysign-shared build

# web 소스 + 빌드
COPY apps/web ./apps/web

WORKDIR /app/apps/web
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN pnpm build

# nginx로 정적 파일 서빙
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
