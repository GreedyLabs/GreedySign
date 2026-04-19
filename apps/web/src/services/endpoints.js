/**
 * API 엔드포인트 중앙 관리
 * 모든 API 경로를 한 곳에서 관리하여 유지보수성 향상
 */

export const API_ENDPOINTS = {
  // 인증
  auth: {
    google: '/auth/google',
    logout: '/auth/logout',
    usersSearch: (query) => `/auth/users/search?q=${encodeURIComponent(query)}`,
  },

  // 문서
  documents: {
    list: '/documents',
    upload: '/documents/upload',
    get: (id) => `/documents/${id}`,
    delete: (id) => `/documents/${id}`,
    send: (id) => `/documents/${id}/send`,
    void: (id) => `/documents/${id}/void`,
  },

  // 참여자 (구 shares → participants)
  participants: {
    list: (docId) => `/documents/${docId}/participants`,
    add: (docId) => `/documents/${docId}/participants`,
    update: (docId, id) => `/documents/${docId}/participants/${id}`,
    remove: (docId, id) => `/documents/${docId}/participants/${id}`,
    accept: (docId) => `/documents/${docId}/participants/me/accept`,
    decline: (docId) => `/documents/${docId}/participants/me/decline`,
  },

  // 필드
  fields: {
    list: (docId) => `/documents/${docId}/fields`,
    create: (docId) => `/documents/${docId}/fields`,
    update: (docId, fieldId) => `/documents/${docId}/fields/${fieldId}`,
    remove: (docId, fieldId) => `/documents/${docId}/fields/${fieldId}`,
    response: (docId, fieldId) => `/documents/${docId}/fields/${fieldId}/response`,
  },

  // 서명 제출 / 거부
  signing: {
    submit: (docId) => `/documents/${docId}/signing/submit`,
    decline: (docId) => `/documents/${docId}/signing/decline`,
  },

  // 내보내기
  export: {
    download: (docId) => `/documents/${docId}/export`,
    bulk: (docId) => `/documents/${docId}/export/bulk-individual`,
  },

  // 서명 라이브러리 (user_signatures)
  signatures: {
    list: '/signatures',
    create: '/signatures',
    update: (id) => `/signatures/${id}`,
    delete: (id) => `/signatures/${id}`,
  },

  // 초대 링크 (이메일 → 수락)
  invite: {
    get: (token) => `/invite/${token}`,
    accept: (token) => `/invite/${token}/accept`,
  },

  // 알림
  notifications: {
    list: '/notifications',
    readAll: '/notifications/read',
    readOne: (id) => `/notifications/${id}/read`,
  },

  // 활동 로그
  activity: '/activity',

  // 완료 인증서
  certificate: (docId) => `/documents/${docId}/certificate`,

  // SSE 이벤트 스트림
  events: {
    user: (token) => `/events/user?token=${encodeURIComponent(token)}`,
    document: (docId, token) => `/events/documents/${docId}?token=${encodeURIComponent(token)}`,
  },

  // 통합 검색
  search: (q) => `/search?q=${encodeURIComponent(q)}`,
};
