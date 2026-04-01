# 실행 방법

## 사전 준비

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치
- Google OAuth 클라이언트 ID ([Google Cloud Console](https://console.cloud.google.com/)에서 발급)
- SMTP 계정 (AWS SES, Gmail, 기타 메일 서버)

## 환경 변수 설정

루트 디렉토리에 `.env` 파일을 생성합니다.

```env
JWT_SECRET=your_jwt_secret_here

GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

POSTGRES_PASSWORD=your_db_password

APP_URL=http://localhost

SMTP_HOST=email-smtp.ap-northeast-2.amazonaws.com
SMTP_PORT=587
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password
SMTP_FROM=noreply@yourdomain.com
```

## Docker Compose로 실행

```bash
docker compose up -d --build
```

브라우저에서 `http://localhost`로 접속합니다.

### 컨테이너 중지

```bash
docker compose down
```

### DB 초기화 (데이터 삭제 포함)

```bash
docker compose down -v
```

## 로컬 개발 환경

Docker 없이 직접 실행하려면 다음이 필요합니다.

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL 17

### 의존성 설치

```bash
pnpm install
```

### 개발 서버 실행

```bash
# 백엔드 (apps/api)
pnpm --filter api dev

# 프론트엔드 (apps/web) — 별도 터미널
pnpm --filter web dev
```

프론트엔드는 `http://localhost:5173`, 백엔드는 `http://localhost:3001`로 실행됩니다.

> 로컬 개발 시 Vite의 `vite.config.js`에서 `/api` 프록시를 `http://localhost:3001`으로 설정해야 합니다.
