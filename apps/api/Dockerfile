FROM node:20-alpine

WORKDIR /app

# pnpm 설치
RUN corepack enable && corepack prepare pnpm@latest --activate

# 루트 workspace 설정 파일 복사
COPY pnpm-workspace.yaml ./
COPY package.json ./

# 패키지 파일 복사 (의존성 캐시 레이어 활용)
COPY apps/api/package.json ./apps/api/

RUN pnpm install --no-frozen-lockfile

# 소스 복사
COPY apps/api ./apps/api

WORKDIR /app/apps/api

# 마이그레이션 SQL 생성 (DB 연결 불필요, 스키마에서 SQL만 추출)
RUN DATABASE_URL=postgresql://dummy:dummy@localhost/dummy pnpm run db:generate

# TypeScript 컴파일
RUN pnpm run build

RUN chmod +x entrypoint.sh

EXPOSE 3001

CMD ["sh", "entrypoint.sh"]
