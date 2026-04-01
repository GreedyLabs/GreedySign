# 데이터베이스 스키마

## 테이블 구조

### users
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | 사용자 식별자 |
| email | TEXT UNIQUE | 이메일 (권한 기준) |
| name | TEXT | 표시 이름 |
| google_id | TEXT | Google OAuth sub |
| avatar_url | TEXT | 프로필 이미지 |
| created_at | TIMESTAMPTZ | 가입일 |

### documents
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | 문서 식별자 |
| owner_id | UUID FK | 소유자 (users) |
| name | TEXT | 파일명 |
| pdf_path | TEXT | 저장 경로 (storage 추상화) |
| pdf_hash | TEXT | SHA-256 해시 (무결성 검증) |
| size_bytes | INTEGER | 파일 크기 |
| page_count | INTEGER | 페이지 수 |
| merge_mode | TEXT | 병합 방식: individual / combined |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### document_shares
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| document_id | UUID FK | 문서 |
| owner_id | UUID FK | 초대한 소유자 |
| invitee_id | UUID FK | 가입된 초대자 (nullable) |
| invitee_email | TEXT | 초대 이메일 (권한 기준) |
| invite_token | TEXT UNIQUE | 초대 링크 토큰 (수락 후 NULL) |
| invite_status | TEXT | pending / accepted / declined |
| signing_status | TEXT | not_started / in_progress / completed |
| invited_at | TIMESTAMPTZ | |
| responded_at | TIMESTAMPTZ | 수락/거절 시각 |
| completed_at | TIMESTAMPTZ | 서명 완료 시각 |

### form_fields
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| document_id | UUID FK | |
| page_number | INTEGER | |
| field_type | TEXT | text / checkbox |
| field_name | TEXT | 필드 레이블 |
| x, y | FLOAT | PDF 좌표 (좌하단 원점) |
| width, height | FLOAT | PDF 포인트 단위 |

### field_values
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| field_id | UUID FK | |
| user_id | UUID FK | 입력한 사용자 |
| value | TEXT | 입력값 |
| updated_at | TIMESTAMPTZ | |

> UNIQUE(field_id, user_id) — 사용자별 독립 저장

### user_signatures
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK | |
| name | TEXT | 서명 이름 |
| method | TEXT | draw / image |
| svg_data | TEXT | SVG 원본 데이터 |
| thumbnail | TEXT | Base64 PNG 썸네일 |
| is_default | BOOLEAN | 기본 서명 여부 |

### signature_placements
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| document_id | UUID FK | |
| user_id | UUID FK | 배치한 사용자 |
| signature_id | UUID FK | 원본 서명 |
| page_number | INTEGER | |
| x, y | FLOAT | PDF 좌표 |
| width, height | FLOAT | |
| rotation | FLOAT | 회전각 |
| svg_data | TEXT | 배치 시점의 SVG 스냅샷 |

### audit_logs
| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | UUID PK | |
| document_id | UUID FK | |
| user_id | UUID FK | |
| action | TEXT | 행위 유형 |
| meta | JSONB | 추가 컨텍스트 |
| ip | TEXT | 요청 IP |
| user_agent | TEXT | 브라우저 정보 |
| created_at | TIMESTAMPTZ | |

#### 기록되는 action 목록
| action | 발생 시점 |
|---|---|
| document_uploaded | PDF 업로드 |
| document_exported | PDF 내보내기 |
| signing_started | 서명 시작 |
| signing_completed | 서명 완료 |
| share_invited | 서명자 초대 |
| share_accepted | 초대 수락 |
| share_declined | 초대 거절 |

## 데이터 분리 원칙

| 데이터 | 공유 여부 | 설명 |
|---|---|---|
| PDF 원본 | 공유 | 모든 사용자가 동일한 PDF를 봄 |
| 폼 필드 위치·타입 | 공유 | 문서에 귀속, 모두에게 표시 |
| 필드 입력값 | 개인 | 사용자별 독립 저장 |
| 서명 이미지 | 개인 | 사용자별 저장, 문서 간 재사용 |
| 서명 배치 위치 | 개인 | 사용자별 독립 |
| 서명 완료 상태 | 소유자 열람 | 소유자만 전체 현황 조회 |
