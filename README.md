# GreedySign

PDF 전자서명 SaaS. 브라우저 안에서 문서를 업로드하고, 참여자별로 필드를 할당해 서명을 받고, 무결성이 검증된 최종본을 보관합니다.

> 상태: DocuSign 스타일의 **1:1 봉투(envelope) 기반 워크플로우**로 구현되어 있습니다. 한 문서에 지정된 참여자들이 각자 자신에게 배정된 필드를 채우면 전원 완료 시 합본이 잠기는(frozen) 구조입니다.

---

## 모노레포 구성

```
GreedySign/
├─ apps/
│  ├─ api/     Express + TypeScript + Drizzle ORM
│  └─ web/     React 19 + Vite + TanStack Query + Zustand
├─ docs/
│  ├─ architecture.md
│  ├─ schema.md
│  └─ setup.md
├─ docker-compose.yml
├─ GreedySign.md   ← 기획/설계 문서
├─ todo.md         ← 구현 현황 및 할 일
└─ README.md
```

- 패키지 매니저: **pnpm** (workspace 기반)
- 배포: Docker Compose (nginx + api + web + postgres 17)
- 인증: Google OAuth 2.0 + JWT (7일 만료)

---

## 핵심 데이터 모델 (요약)

| 테이블 | 역할 |
|---|---|
| `users` | 계정 — 이메일 유일, Google 연동 |
| `documents` | 원본 PDF 봉투. `status`: `draft` / `in_progress` / `completed` / `voided`. `signing_mode`: `parallel` / `sequential`. 완료 시 `signed_pdf_path`·`signed_pdf_hash`에 frozen 합본 기록 |
| `document_participants` | 봉투당 참여자 레코드. `role`(signer/cc), `is_owner`, `signing_order`, `invite_token`, `invite_status`, `signing_status` |
| `form_fields` | **특정 `participant_id`에 귀속된** 필드. `field_type`: text/checkbox/signature/initial/date. 한 필드는 한 사람 전용 |
| `field_responses` | `(field_id, participant_id)` 유일. 본인 필드에만 값 기록 가능 |
| `user_signatures` | 사용자별 서명 라이브러리 (draw/image, SVG·PNG 썸네일, is_default) |
| `notifications` | 사용자 단위 인앱 알림 |
| `audit_logs` | 모든 주요 이벤트 기록 (IP/UA/JSONB meta 포함) |

> 중요한 아키텍처 사실: **필드는 봉투 내의 특정 참여자에게 묶여 있습니다.** `form_fields.participant_id`가 NOT NULL 전제로 운영되며, 여러 참여자에게 동일한 필드를 일괄 배포하는 개념은 스키마에 존재하지 않습니다.

---

## 현재 구현되어 있는 기능

### 인증 · 사용자
- Google OAuth 로그인, JWT 세션, `PUT /auth/profile`로 이름 수정
- 같은 도메인 사용자 자동완성 검색 (`/auth/users/search`)

### 문서 라이프사이클
- `POST /documents/upload` — PDF 업로드, SHA-256 기록, 소유자 participant 자동 생성
- `GET /documents` — 소유/공유 문서 목록 (share_count, completed_count 집계)
- `GET /documents/:id` — 상세 + 내 필드/응답
- `GET /documents/:id/pdf` — PDF 스트리밍
- `POST /documents/:id/send` — draft → in_progress, pending 참여자에게 초대 메일 일괄 발송
- `PATCH /documents/:id/void` — 진행 중 봉투 무효화 (사유 기록, 참여자 알림)
- `DELETE /documents/:id` — 삭제

### 참여자 (per-envelope)
- `GET / POST / PATCH / DELETE /documents/:id/participants` — 개별 추가/수정/삭제
- `PATCH /documents/:id/participants/me/accept|decline` — 초대 수락/거부

### 필드 · 응답
- `GET / POST / PUT / DELETE /documents/:id/fields` — 참여자별 필드 배치 (owner only)
- `PUT /documents/:id/fields/:fieldId/response` — **본인에게 할당된 필드만** 응답 저장

### 서명 제출 · 완료
- `PATCH /documents/:id/signing/submit` — 필수 필드 검증 후 서명 완료
- `PATCH /documents/:id/signing/decline` — 사유와 함께 거부
- 모두 완료 시 자동 `freezeDocument`: 합본 PDF 생성 → SHA-256 기록 → 소유자·참여자 알림·이메일 발송 → `documents.status = completed`

### 내보내기
- `POST /documents/:id/export` — 완료된 문서는 frozen PDF 서빙, 아니면 개인/합본 PDF 빌드
- `POST /documents/:id/export/bulk-individual` — 참여자별 개인 서명본을 ZIP으로 묶어 다운로드

### 실시간 · 알림
- SSE (`/events`)로 문서/사용자 이벤트 브로드캐스트
- `notifications` 테이블 + 인앱 알림 페이지
- nodemailer 기반 초대/완료/거부 이메일

### 서명 · UI
- 캔버스 드로잉 / 이미지 업로드 서명, 라이브러리 관리
- pdfjs-dist 기반 고해상도 PDF 뷰어, 줌·페이지 네비
- SPA 라우터, AppShell, 문서 테이블, 업로드 2-step 위저드, 활동 로그, 알림, 설정(테마/밀도/모서리)
- 완료 인증서 페이지 (`/docs/:id/complete`) — 타임스탬프·해시·서명자 목록

### 보안 · 무결성
- 업로드 시 SHA-256 기록, 내보내기 전 원본 재검증
- 완료 시 frozen 합본 SHA-256 기록, 다운로드 시 재검증
- 서명 완료·문서 잠금 이후 API 레벨 편집 차단 (`checkDocumentLocked`)

---

## 문서
- [실행 방법](docs/setup.md)
- [아키텍처](docs/architecture.md)
- [DB 스키마](docs/schema.md)
- [상세 기획 / 대량 배포 플로우 설계](GreedySign.md)
- [구현 현황 · TODO](todo.md)
