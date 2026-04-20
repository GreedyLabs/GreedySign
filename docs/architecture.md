# 기술 스택 및 아키텍처

## 기술 스택

| 영역 | 기술 |
|---|---|
| 언어 | TypeScript (apps/web, apps/api, packages/shared 모두 `.ts`/`.tsx`) |
| 백엔드 | Node.js + Hono (`@hono/node-server`) |
| API 검증 | Zod v4 + `@hono/zod-validator` (공유 스키마: `packages/shared`) — 프론트도 동일 스키마로 폼 입력 선검증 |
| 데이터베이스 | PostgreSQL 17 + Drizzle ORM |
| 프론트엔드 | React 19 + Vite (TypeScript strict) |
| 라우팅 | TanStack Router (파일 기반 + 로더 프리페칭 + search schema, 전부 타입 추론) |
| 서버 상태 | TanStack Query (제네릭 `useQuery<T>` / `useMutation`) |
| 클라이언트 상태 | Zustand (`authStore` 단일 — user/token 만 보관, 타입 세이프 셀렉터) |
| HTTP 클라이언트 | fetch 기반 얇은 래퍼 (`services/api.ts`, `ApiError` + 제네릭 응답 타입) |
| PDF 렌더링 | pdfjs-dist v4 (canvas, DPR 대응) |
| 편집 레이어 | SVG 오버레이, 좌표 변환 헬퍼 |
| 실시간 | Hono `streamSSE` (서버) + EventSource (클라) · 문서/사용자 두 채널 |
| PDF 병합·평탄화 | pdf-lib + sharp (서버 사이드) |
| 인증 | Google OAuth + JWT (7일) |
| 이메일 | nodemailer + SMTP (AWS SES 등) |
| 파일 저장 | 로컬 `/uploads` (storage 추상화 레이어로 S3 전환 가능) |
| SEO | TanStack Router `head` API + `<HeadContent />` · JSON-LD · sitemap/robots |
| 패키지 관리 | pnpm (workspace) |
| 배포 | Docker Compose + nginx |

## 프로젝트 구조

```
apps/
├── api/src/
│   ├── hono/
│   │   ├── app.ts          # Hono 인스턴스 + 전역 미들웨어(CORS/logger/secure-headers)
│   │   ├── context.ts      # Variables 타입(user 등)
│   │   ├── validator.ts    # zValidator 래퍼 — {error: string} 계약 유지
│   │   ├── reqInfo.ts      # ip/headers/socket 어댑터 (서비스 계층 호환용)
│   │   ├── middleware/     # auth, docAccess (Hono 미들웨어)
│   │   └── routes/         # 15 개 라우트 (Express 시절과 URL·응답 shape 동일)
│   ├── services/           # queries, pdfMerge, sse, storage, email, freeze, audit, campaignHooks
│   ├── db/                 # pool, init, drizzle schema
│   └── index.ts            # @hono/node-server serve() 8 줄 엔트리
└── web/src/
    ├── router/             # __root, guards, loaders, createRouter
    ├── routes/             # 18 개 파일 라우트 (code splitting 자동)
    ├── routeTree.gen.ts    # vite 빌드 시 자동 생성 (git 무시)
    ├── pages/              # 각 라우트가 렌더하는 페이지 컴포넌트
    ├── components/         # EditorPage, Dashboard, EditLayer, Sidebar 등
    ├── contexts/           # SSEContext (실시간 이벤트 중앙 관리)
    ├── stores/             # authStore (Zustand — user/token 전용)
    ├── services/           # api.ts (fetch 래퍼, ApiError), endpoints.ts
    └── lib/                # seo.ts, format.ts, router.tsx (TanStack Router re-export)

packages/
└── shared/                 # @greedylabs/greedysign-shared
    └── src/                # Zod 스키마 (auth, documents, fields, templates,
                            #   campaigns, participants, signing, signatures,
                            #   export, search, common)
```

## API 라우팅 구조

전부 `/api` 하위에 마운트됩니다(`src/hono/app.ts`).

```
/api/auth                      — Google 로그인·프로필·도메인 사용자 검색
/api/documents                 — 문서 CRUD · multipart 업로드 (c.req.parseBody)
  /:docId/participants         — 참여자 CRUD
  /:docId/fields               — 필드 생성
  /:docId/signing/*            — 서명 제출·거절·확정(freezeDocument)
  /:docId/export               — PDF·ZIP 내보내기 (Readable.toWeb)
  /:docId/certificate          — 완료 인증서 + 자가복구
/api/fields/:id                — 필드 수정·삭제·값 저장
/api/signatures                — 서명 라이브러리 CRUD
/api/templates                 — 템플릿 + 1:1 발송(/:id/instantiate)
/api/campaigns                 — 캠페인 + 수신자 라이프사이클
/api/events/user?token=        — 사용자 전역 SSE (streamSSE)
/api/events/documents/:docId?token=  — 문서별 SSE
/api/invite/:token             — 초대 수락 (비인증 경로 포함)
/api/activity                  — 감사 로그 조회
/api/notifications             — 인앱 알림
/api/search                    — 통합 검색
/health                        — 서비스 헬스체크 (/api 밖)
```

SSE 경로는 EventSource 가 Authorization 헤더를 못 쓰는 제약 때문에 `?token=` 쿼리
JWT 검증 + docAccess 인라인 SQL 로 유지됩니다. 그 외 라우트는 `authMiddleware` +
`zValidator` 로 통일.

## 핵심 설계

**권한 모델**: 이메일 기준 접근 제어. 서명 완료 시 편집 잠금 (소유자 제외).

**좌표계**: DB는 PDF 포인트 (좌하단 원점), 화면은 픽셀 변환, 내보내기는 DB 값 직접 사용.

**실시간**: `services/sse.ts` 가 transport-neutral `SseSink` 콜백 허브. 프론트는
`SSEContext` 로 문서별·사용자별 두 채널을 관리, 연결 실패 시 10 초 폴링으로 폴백.

**검증**: 모든 라우트가 공통 `validate(target, schema)` 래퍼로 `c.req.valid()` 에서
타입-세이프 파싱 결과를 받고, 실패 시 `{ error: '...' }` 400 을 반환해 기존 클라이언트
토스트/인라인 에러 UX 를 그대로 유지. 스키마 소스는 `packages/shared` 에서 프론트·백이
공유.

**SEO (CSR SPA)**: TanStack Router 의 `head` API 로 라우트별 title/meta/OG/JSON-LD 를
선언하고 `<HeadContent />` 가 `document.head` 에 주입. `__root` 의 기본값은
`noindex, nofollow` 이며 `/`·`/guide` 만 명시적으로 index 허용(opt-in 화이트리스트).

## 환경 변수

루트 `.env` 파일에서 관리하며 `docker-compose.yml`을 통해 각 서비스에 주입됩니다.

| 변수 | 설명 |
|---|---|
| `JWT_SECRET` | JWT 서명 키 |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `POSTGRES_PASSWORD` | DB 비밀번호 |
| `APP_URL` | 서비스 도메인 (초대 링크 생성용) |
| `SMTP_HOST` | SMTP 서버 호스트 |
| `SMTP_PORT` | SMTP 포트 (기본 587) |
| `SMTP_USER` | SMTP 사용자명 |
| `SMTP_PASS` | SMTP 비밀번호 |
| `SMTP_FROM` | 발신자 이메일 주소 |
| `DISABLE_REQUEST_LOG` | `1` 이면 `hono/logger` 출력을 끈다 (운영 로그 집계용) |
