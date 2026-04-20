FROM node:20-alpine

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

# workspace 루트 메타
COPY pnpm-workspace.yaml ./
COPY package.json ./

# workspace 패키지 manifest 는 install 전에 전부 있어야 workspace:* 해석이 된다
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

RUN pnpm install --no-frozen-lockfile

# shared 스키마 패키지 먼저 빌드 (dist 가 있어야 api 의 import 가 해석된다)
COPY packages/shared ./packages/shared
RUN pnpm --filter @greedylabs/greedysign-shared build

# API 소스 + 빌드
# drizzle/*.sql 은 repo 에 커밋되어 함께 복사된다 — build 시 generate 하지 않는다.
COPY apps/api ./apps/api

WORKDIR /app/apps/api

# TypeScript 컴파일
RUN pnpm run build

RUN chmod +x entrypoint.sh

EXPOSE 3001

CMD ["sh", "entrypoint.sh"]
