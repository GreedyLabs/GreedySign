# GreedySign

**PDF 기반 전자서명을 사내·팀 인프라에 그대로 올려서 운영하기 위한 오픈소스 서비스입니다.**

계약서·동의서·근로계약서 같은 PDF 서식을 한 번 업로드하면,
한 명에게 보내거나, 수백 명에게 일괄 배포하거나, 같은 서식을 계속 재사용할 수 있습니다.

---

## GreedySign 이 해결하는 문제

**"PDF 하나를 여러 번, 여러 사람에게, 안전하게 서명받아야 한다"**
이 한 줄을 제대로 풀기 위한 도구입니다.

- 한 번 만든 근로계약서를 **입사자가 생길 때마다 1:1 로** 다시 보내야 함
- 분기마다 임직원 전원에게 **같은 동의서를 N명에게 한꺼번에** 받아야 함
- 누가 언제 어디서 서명했는지 **감사 로그와 무결성**이 증명돼야 함
- 사내 인프라에 배포해 **데이터를 외부로 내보내지 않아야** 함

이 네 가지 중 어떤 조합이 필요하든, 같은 에디터 · 같은 대시보드 · 같은 감사 로그 안에서 처리합니다.

---

## 제품 구성

### 1. 개별 문서 (`/docs`)
DocuSign 스타일의 1:1 또는 1:소수 서명. 문서마다 참여자(서명자 / 참조자)를 직접 지정하고, 드래그로 필드를 배치하고, 발송합니다.

### 2. 템플릿 (`/templates`)
PDF 한 장에 필드를 한 번만 배치해 두면 **재사용 가능한 서식**이 됩니다.
- **1:1 발송** — 템플릿으로 한 명에게만 보내기. 새 입사자에게 같은 계약서를 개별 발송하는 식의 장기간 반복 사용에 적합합니다. (캠페인 오버헤드 없음)
- **대량 배포** — 수신자 목록(CSV 붙여넣기 지원)을 붙여 N명에게 각자 개별 문서를 생성하고 일괄 발송합니다.

### 3. 캠페인 (`/campaigns`)
대량 배포를 묶어 관리하는 단위입니다. 대시보드에서 발송 · 열람 · 서명 · 거절 · 제외 진행률을 실시간으로 보고, 수신자를 교체 · 재발송 · 제외 · 수동 완료까지 한 곳에서 처리합니다.

### 4. 완료 인증서 (`/docs/:id/complete`)
전원 서명이 완료되면 원본과 확정본 PDF 해시, 서명자별 IP · 타임스탬프, 감사 로그 항목을 담은 인증서 페이지가 자동 발급됩니다. 단건 다운로드 또는 캠페인 단위 ZIP 일괄 다운로드가 가능합니다.

---

## 주요 기능

- **Google OAuth 로그인 · JWT 세션** — 비밀번호를 서버에 보관하지 않습니다
- **드래그로 끝나는 필드 배치** — 텍스트 · 서명 · 날짜 · 체크박스 · 이니셜
- **필드는 참여자에게 귀속** — 각자 자신의 필드만 채울 수 있어 역할 혼동이 없습니다
- **손글씨 · 이미지 서명 라이브러리** — 한 번 저장해 두고 다음 문서에서 재사용
- **SHA-256 무결성 이중 기록** — 업로드 시점 · 확정 시점 해시를 모두 저장하고 내보낼 때 재검증
- **SSE 실시간 집계** — 대시보드에서 서명 · 거절이 즉시 반영 (10 초 폴링 폴백)
- **인앱 알림 + 이메일** — 초대 · 완료 · 거절 · 무효화 이벤트
- **감사 로그** — IP · User-Agent · 메타데이터(JSONB) 를 모든 주요 액션마다 기록
- **CSV · ZIP 내보내기** — 수신자 상태 스냅샷, 완료 PDF 묶음
- **라이트 / 다크 테마** · **밀도 · 모서리 커스터마이징**

---

## 배포

운영 환경은 **Docker Compose** 한 줄로 띄울 수 있습니다.

```
docker compose up -d
```

구성 요소:
- `nginx` — 리버스 프록시 · 정적 자산 서빙 · HTTPS 종단
- `web` — React 19 + TypeScript + Vite + TanStack Router/Query 프론트엔드 (Vite 로 프리빌드 후 nginx 가 서빙)
- `api` — Hono + TypeScript + Drizzle ORM + Zod (`@hono/node-server` 단일 프로세스)
- `postgres` — PostgreSQL 17

자세한 내용은 [docs/setup.md](docs/setup.md) 를 참고하세요.

### 배포 전 체크리스트
- [ ] `.env` 에 `DATABASE_URL`, `JWT_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, SMTP 설정
- [ ] `nginx` 에 HTTPS 인증서 마운트 · `X-Forwarded-For` / `X-Real-IP` 헤더 설정
- [ ] 업로드 디렉터리(`uploads/`) 영속 볼륨 마운트 — 또는 S3 연결 (I-2 참고)
- [ ] Google OAuth 콘솔에 리디렉트 URI 등록

---

## 리포지토리 구조

```
GreedySign/
├─ apps/
│  ├─ api/     Hono + TypeScript + Drizzle ORM + Zod
│  └─ web/     React 19 + TypeScript + Vite + TanStack Router/Query
├─ packages/
│  └─ shared/ 프론트-백 공유 Zod 스키마 (@greedylabs/greedysign-shared)
├─ docs/
│  ├─ architecture.md
│  ├─ schema.md
│  └─ setup.md
├─ docker-compose.yml
├─ GreedySign.md      기획 · 설계 문서
├─ TODO.md            앞으로의 작업 목록
└─ README.md
```

- 패키지 매니저: **pnpm** (workspace 기반)

---

## 문서

- [실행 방법 · 배포](docs/setup.md)
- [아키텍처](docs/architecture.md)
- [DB 스키마](docs/schema.md)
- [상세 기획 · 대량 배포 플로우 설계](GreedySign.md)
- [앞으로의 작업 목록](TODO.md)

---

## 라이선스

오픈소스 · 자체 호스팅 전용. 설치와 사용 모두 무료입니다. 서버 자원과 SMTP · 도메인만 준비하면 됩니다.
