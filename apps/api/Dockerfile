FROM node:20-alpine

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

# 루트 workspace 설정 파일 복사
COPY pnpm-workspace.yaml ./
COPY package.json ./

# 패키지 파일 복사 (의존성 캐시 레이어 활용)
COPY packages/types/package.json ./packages/types/
COPY packages/api-client/package.json ./packages/api-client/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile

# 소스 복사
COPY packages/types ./packages/types
COPY packages/api-client ./packages/api-client
COPY apps/api ./apps/api

WORKDIR /app/apps/api

COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 3001

CMD ["sh", "entrypoint.sh"]
