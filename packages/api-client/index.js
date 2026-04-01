import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;

// Documents
export const listDocuments = () => api.get('/documents');
export const getDocument = (docId) => api.get(`/documents/${docId}`);
export const uploadDocument = (formData) =>
  api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
export const deleteDocument = (docId) => api.delete(`/documents/${docId}`);
export const setMergeMode = (docId, mode) =>
  api.put(`/documents/${docId}/merge-mode`, { merge_mode: mode });

// Shares
export const getShares = (docId) => api.get(`/documents/${docId}/shares`);
export const inviteUser = (docId, email) =>
  api.post(`/documents/${docId}/shares`, { email });
export const revokeShare = (docId, shareId) =>
  api.delete(`/documents/${docId}/shares/${shareId}`);
export const acceptShare = (docId) =>
  api.patch(`/documents/${docId}/shares/accept`);
export const declineShare = (docId) =>
  api.patch(`/documents/${docId}/shares/decline`);

// Signing status
export const updateSigningStatus = (docId, status) =>
  api.patch(`/documents/${docId}/signing/status`, { status });

// Signatures
export const listSignatures = () => api.get('/signatures');
export const createSignature = (data) => api.post('/signatures', data);
export const deleteSignature = (id) => api.delete(`/signatures/${id}`);
export const placeSignature = (docId, data) =>
  api.post(`/signatures/documents/${docId}/placements`, data);
export const updatePlacement = (id, data) =>
  api.put(`/signatures/placements/${id}`, data);
export const deletePlacement = (id) =>
  api.delete(`/signatures/placements/${id}`);

// Export
export const exportPdf = (docId, mode) =>
  api.post(`/documents/${docId}/export`, { mode }, { responseType: 'blob' });
export const exportBulkIndividual = (docId) =>
  api.post(`/documents/${docId}/export/bulk-individual`, {}, { responseType: 'blob' });
