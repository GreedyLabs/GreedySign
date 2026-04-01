# 기술 스택 및 아키텍처

## 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Node.js + Express |
| 데이터베이스 | PostgreSQL 17 |
| 프론트엔드 | React 19 + Vite |
| 상태 관리 | Zustand (인증), TanStack Query (서버 상태) |
| PDF 렌더링 | pdfjs-dist v4 (canvas, DPR 대응) |
| 편집 레이어 | SVG 오버레이, 좌표 변환 헬퍼 |
| 실시간 | SSE (Server-Sent Events, 중앙 관리) |
| PDF 병합 | pdf-lib + sharp (서버 사이드) |
| 인증 | Google OAuth + JWT (7일) |
| 이메일 | nodemailer + SMTP (AWS SES 등) |
| 파일 저장 | 로컬 `/uploads` (storage 추상화 레이어로 S3 전환 가능) |
| 패키지 관리 | pnpm |
| 배포 | Docker Compose + nginx |

## 프로젝트 구조

```
apps/
├── api/src/
│   ├── routes/          # 계층적 RESTful 라우팅
│   ├── services/        # queries.js (공통 쿼리), pdfMerge, sse, storage, email
│   ├── middleware/      # auth, docAccess
│   └── db/              # pool, init
└── web/src/
    ├── components/      # EditorPage, Dashboard, EditLayer, Sidebar 등
    ├── contexts/        # SSEContext (실시간 이벤트 중앙 관리)
    ├── stores/          # authStore (Zustand)
    └── services/        # api, endpoints
```

## API 라우팅 구조

```
/api/auth                      — 인증
/api/documents                 — 문서 CRUD
  /:docId/shares               — 공유 관리
  /:docId/signing/status       — 서명 상태
  /:docId/export               — PDF 내보내기 (개인/합본/일괄)
  /:docId/fields               — 필드 생성
/api/fields/:id                — 필드 수정·삭제·값 저장
/api/signatures                — 서명 CRUD, 배치 관리
/api/events/user               — 사용자 전역 SSE
/api/events/documents/:docId   — 문서별 SSE
/api/invite/:token             — 초대 수락
```

## 핵심 설계

**권한 모델**: 이메일 기준 접근 제어. 서명 완료 시 편집 잠금 (소유자 제외).

**좌표계**: DB는 PDF 포인트 (좌하단 원점), 화면은 픽셀 변환, 내보내기는 DB 값 직접 사용.

**실시간**: SSEContext로 연결 중앙 관리. 문서 공유·서명 상태 변경 시 Dashboard/Editor 자동 갱신.

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
