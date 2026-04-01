# 기술 스택 및 아키텍처

## 기술 스택

| 영역 | 기술 |
|---|---|
| 백엔드 | Node.js + Express |
| 데이터베이스 | PostgreSQL 17 |
| 프론트엔드 | React 19 + Vite |
| 상태 관리 | Zustand (인증), TanStack Query (서버 상태) |
| PDF 렌더링 | pdfjs-dist v4 (canvas, DPR 대응) |
| 편집 레이어 | SVG 오버레이 |
| 실시간 | SSE (Server-Sent Events) |
| PDF 병합 | pdf-lib + sharp (서버 사이드) |
| 인증 | Google OAuth + JWT (7일) |
| 이메일 | nodemailer + SMTP (AWS SES 등) |
| 파일 저장 | 로컬 `/uploads` (storage 추상화 레이어로 S3 전환 가능) |
| 패키지 관리 | pnpm workspaces (모노레포) |
| 배포 | Docker Compose + nginx |

## 프로젝트 구조

```
.
├── apps/
│   ├── api/                          # Express 백엔드
│   │   └── src/
│   │       ├── index.js              # 서버 엔트리포인트 및 라우터 등록
│   │       ├── db/
│   │       │   ├── pool.js           # PostgreSQL 연결 풀
│   │       │   └── init.js           # DB 스키마 초기화
│   │       ├── middleware/
│   │       │   ├── auth.js           # JWT 인증 미들웨어, verifyToken
│   │       │   └── docAccess.js      # 문서 접근 권한 (이메일 기준)
│   │       ├── routes/
│   │       │   ├── auth.js           # Google OAuth 로그인
│   │       │   ├── documents.js      # PDF 업로드·조회·삭제
│   │       │   ├── fields.js         # 폼 필드 CRUD + 값 저장
│   │       │   ├── signatures.js     # 서명 저장·배치 CRUD
│   │       │   ├── shares.js         # 문서 공유 초대·수락·거절
│   │       │   ├── signing.js        # 서명 완료 상태 관리
│   │       │   ├── export.js         # PDF 병합 내보내기
│   │       │   ├── events.js         # SSE 연결 (/api/events/:id)
│   │       │   └── invite.js         # 초대 토큰 조회·수락
│   │       └── services/
│   │           ├── storage.js        # PDF 파일 저장 추상화
│   │           ├── pdfMerge.js       # PDF 병합 로직
│   │           ├── sse.js            # SSE 클라이언트 관리
│   │           ├── email.js          # 초대 이메일 발송
│   │           └── audit.js          # 감사 로그 기록
│   └── web/                          # React 프론트엔드
│       └── src/
│           ├── App.jsx               # 라우팅 (Auth / Invite / Dashboard / Editor)
│           ├── components/
│           │   ├── AuthPage.jsx      # Google 로그인 UI
│           │   ├── Dashboard.jsx     # 문서 목록 (내 문서 / 공유받은 문서)
│           │   ├── EditorPage.jsx    # 메인 편집 화면 (react-query)
│           │   ├── PdfViewer.jsx     # PDF.js 렌더링 캔버스
│           │   ├── EditLayer.jsx     # SVG 편집 레이어 (필드·서명 배치)
│           │   ├── Sidebar.jsx       # 도구·서명·내보내기 패널
│           │   ├── SignatureModal.jsx # 서명 생성/수정 모달
│           │   ├── ShareModal.jsx    # 문서 공유·초대·병합 방식 설정
│           │   ├── SigningStatusPanel.jsx # 서명자별 완료 현황
│           │   └── InvitePage.jsx    # 초대 링크 수락 화면
│           ├── stores/
│           │   └── authStore.js      # Zustand 인증 상태
│           └── services/
│               ├── api.js            # Axios HTTP 클라이언트 (/api 기본 경로)
│               └── sse.js            # SSE 연결 관리
├── packages/
│   ├── types/                        # 공유 타입 정의
│   └── api-client/                   # API 함수 래퍼
└── docs/                             # 기술 문서
```

## 권한 모델

문서 접근 권한은 **이메일 단일 기준**으로 처리합니다.

- 소유자: `documents.owner_id` → `users.email` JOIN
- 초대자: `document_shares.invitee_email`
- 데이터 기록 (field_values, signature_placements, audit_logs): `user_id` (불변 식별자)

## 좌표계

편집 레이어와 PDF 병합 간 좌표 일관성 규칙:

- **DB 저장**: PDF 포인트 단위, PDF 좌표계 (좌하단 원점, Y↑)
- **화면 렌더링**: `screenX = pdfX × scale`, `screenY = (pdfH - pdfY - objH) × scale`
- **PDF 내보내기**: DB 좌표를 그대로 사용 (변환 없음)

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
