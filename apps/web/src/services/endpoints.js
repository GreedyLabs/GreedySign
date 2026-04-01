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
    get: (id) => `/documents/${id}`,
    upload: '/documents/upload',
    delete: (id) => `/documents/${id}`,
    pdf: (id) => `/documents/${id}/pdf`,
  },

  // 문서 공유
  shares: {
    list: (docId) => `/documents/${docId}/shares`,
    create: (docId) => `/documents/${docId}/shares`,
    delete: (docId, shareId) => `/documents/${docId}/shares/${shareId}`,
    accept: (docId) => `/documents/${docId}/shares/accept`,
    decline: (docId) => `/documents/${docId}/shares/decline`,
  },

  // 서명 상태
  signing: {
    updateStatus: (docId) => `/documents/${docId}/signing/status`,
  },

  // 내보내기
  export: {
    individual: (docId) => `/documents/${docId}/export`,
    combined: (docId) => `/documents/${docId}/export`,
    bulkIndividual: (docId) => `/documents/${docId}/export/bulk-individual`,
  },

  // 필드
  fields: {
    create: (docId) => `/documents/${docId}/fields`,
    update: (id) => `/fields/${id}`,
    delete: (id) => `/fields/${id}`,
    updateValue: (id) => `/fields/${id}/value`,
  },

  // 서명
  signatures: {
    list: '/signatures',
    create: '/signatures',
    update: (id) => `/signatures/${id}`,
    delete: (id) => `/signatures/${id}`,
    placements: (docId) => `/signatures/documents/${docId}/placements`,
    getPlacementsByEmail: (docId, email) => `/signatures/documents/${docId}/placements/${encodeURIComponent(email)}`,
    updatePlacement: (id) => `/signatures/placements/${id}`,
    deletePlacement: (id) => `/signatures/placements/${id}`,
  },

  // 초대
  invite: {
    get: (token) => `/invite/${token}`,
    accept: (token) => `/invite/${token}/accept`,
  },

  // SSE 이벤트
  events: {
    user: (token) => `/events/user?token=${encodeURIComponent(token)}`,
    document: (docId, token) => `/events/documents/${docId}?token=${encodeURIComponent(token)}`,
  },
};
