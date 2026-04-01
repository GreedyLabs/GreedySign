FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-workspace.yaml ./
COPY package.json ./

COPY apps/web/package.json ./apps/web/

RUN pnpm install --no-frozen-lockfile

COPY apps/web ./apps/web

# API 서버 주소를 빌드 시점에 주입 (nginx가 프록시하므로 /api 그대로 사용)
WORKDIR /app/apps/web
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN pnpm build

# nginx로 정적 파일 서빙
FROM nginx:alpine

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
