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

# 한글 폰트 — pdfMerge 합본에 필수. 리포 비대화를 피해 빌드 시 GitHub 에서
# 받고 SHA256 으로 무결성 검증. 16MB 라 캐시 깨지면 매번 다시 받지만, 위 의
# COPY 가 안정적이라 보통은 이 레이어가 그대로 캐시된다.
RUN apk add --no-cache curl \
 && mkdir -p /app/apps/api/assets \
 && curl -fsSL -o /app/apps/api/assets/NotoSansKR-Regular.otf \
      https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf \
 && echo "6bcb2a0703aa137e874fc2dffa85f6c21ba9a67fa329e81b8c801663af7e992a  /app/apps/api/assets/NotoSansKR-Regular.otf" \
      | sha256sum -c - \
 && apk del curl

WORKDIR /app/apps/api

# TypeScript 컴파일
RUN pnpm run build

RUN chmod +x entrypoint.sh

EXPOSE 3001

CMD ["sh", "entrypoint.sh"]
