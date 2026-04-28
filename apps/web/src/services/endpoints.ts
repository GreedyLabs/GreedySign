/**
 * API 엔드포인트 중앙 관리
 * 모든 API 경로를 한 곳에서 관리하여 유지보수성 향상
 */

export const API_ENDPOINTS = {
  // 인증
  auth: {
    google: '/auth/google',
    logout: '/auth/logout',
    usersSearch: (query: string) =>
      `/auth/users/search?q=${encodeURIComponent(query)}`,
  },

  // 문서
  documents: {
    list: '/documents',
    upload: '/documents/upload',
    get: (id: string | number) => `/documents/${id}`,
    delete: (id: string | number) => `/documents/${id}`,
    send: (id: string | number) => `/documents/${id}/send`,
    void: (id: string | number) => `/documents/${id}/void`,
  },

  // 참여자 (구 shares → participants)
  participants: {
    list: (docId: string | number) => `/documents/${docId}/participants`,
    add: (docId: string | number) => `/documents/${docId}/participants`,
    update: (docId: string | number, id: string | number) =>
      `/documents/${docId}/participants/${id}`,
    remove: (docId: string | number, id: string | number) =>
      `/documents/${docId}/participants/${id}`,
    accept: (docId: string | number) =>
      `/documents/${docId}/participants/me/accept`,
    decline: (docId: string | number) =>
      `/documents/${docId}/participants/me/decline`,
  },

  // 필드
  fields: {
    list: (docId: string | number) => `/documents/${docId}/fields`,
    create: (docId: string | number) => `/documents/${docId}/fields`,
    update: (docId: string | number, fieldId: string | number) =>
      `/documents/${docId}/fields/${fieldId}`,
    remove: (docId: string | number, fieldId: string | number) =>
      `/documents/${docId}/fields/${fieldId}`,
    response: (docId: string | number, fieldId: string | number) =>
      `/documents/${docId}/fields/${fieldId}/response`,
  },

  // 서명 제출 / 거부
  signing: {
    submit: (docId: string | number) => `/documents/${docId}/signing/submit`,
    decline: (docId: string | number) => `/documents/${docId}/signing/decline`,
  },

  // 내보내기
  export: {
    download: (docId: string | number) => `/documents/${docId}/export`,
    bulk: (docId: string | number) =>
      `/documents/${docId}/export/bulk-individual`,
  },

  // 서명 라이브러리 (user_signatures)
  signatures: {
    list: '/signatures',
    create: '/signatures',
    update: (id: string | number) => `/signatures/${id}`,
    delete: (id: string | number) => `/signatures/${id}`,
    setDefault: (id: string | number) => `/signatures/${id}/default`,
  },

  // 초대 링크 (이메일 → 수락)
  invite: {
    get: (token: string) => `/invite/${token}`,
    accept: (token: string) => `/invite/${token}/accept`,
  },

  // 알림
  notifications: {
    list: '/notifications',
    readAll: '/notifications/read',
    readOne: (id: string | number) => `/notifications/${id}/read`,
  },

  // 활동 로그
  activity: '/activity',

  // 완료 인증서
  certificate: (docId: string | number) => `/documents/${docId}/certificate`,

  // SSE 이벤트 스트림
  events: {
    user: (token: string) => `/events/user?token=${encodeURIComponent(token)}`,
    document: (docId: string | number, token: string) =>
      `/events/documents/${docId}?token=${encodeURIComponent(token)}`,
  },

  // 통합 검색
  search: (q: string) => `/search?q=${encodeURIComponent(q)}`,

  // 대량 배포 — 템플릿
  templates: {
    list: '/templates',
    upload: '/templates/upload',
    get: (id: string | number) => `/templates/${id}`,
    update: (id: string | number) => `/templates/${id}`,
    remove: (id: string | number) => `/templates/${id}`,
    pdf: (id: string | number) => `/templates/${id}/pdf`,
    fields: (id: string | number) => `/templates/${id}/fields`,
    fieldUpdate: (id: string | number, fieldId: string | number) =>
      `/templates/${id}/fields/${fieldId}`,
    fieldRemove: (id: string | number, fieldId: string | number) =>
      `/templates/${id}/fields/${fieldId}`,
    campaigns: (id: string | number) => `/templates/${id}/campaigns`,
    instantiate: (id: string | number) => `/templates/${id}/instantiate`,
  },

  // 대량 배포 — 캠페인
  campaigns: {
    list: '/campaigns',
    create: '/campaigns',
    get: (id: string | number) => `/campaigns/${id}`,
    update: (id: string | number) => `/campaigns/${id}`,
    cancel: (id: string | number) => `/campaigns/${id}/cancel`,
    complete: (id: string | number) => `/campaigns/${id}/complete`,
    remove: (id: string | number) => `/campaigns/${id}`,
    recipients: (id: string | number) => `/campaigns/${id}/recipients`,
    recipientRemove: (id: string | number, rid: string | number) =>
      `/campaigns/${id}/recipients/${rid}`,
    recipientResend: (id: string | number, rid: string | number) =>
      `/campaigns/${id}/recipients/${rid}/resend`,
    recipientExclude: (id: string | number, rid: string | number) =>
      `/campaigns/${id}/recipients/${rid}/exclude`,
    recipientReplace: (id: string | number, rid: string | number) =>
      `/campaigns/${id}/recipients/${rid}/replace`,
    dispatch: (id: string | number) => `/campaigns/${id}/dispatch`,
    exportCsv: (id: string | number) => `/campaigns/${id}/export.csv`,
    exportZip: (id: string | number) => `/campaigns/${id}/export.zip`,
  },
} as const;
