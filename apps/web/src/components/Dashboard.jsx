import { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import ShareModal from './ShareModal';

const signingStatusLabel = { not_started: '서명 필요', in_progress: '진행 중', completed: '서명 완료' };
const signingStatusColor = { not_started: '#f59e0b', in_progress: '#3b82f6', completed: '#10b981' };

export default function Dashboard({ onOpenDoc }) {
  const { user, logout } = useAuthStore();
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('mine');
  const [shareDocId, setShareDocId] = useState(null);

  useEffect(() => { loadDocs(); }, []);

  const loadDocs = async () => {
    try {
      const { data } = await api.get('/documents');
      setDocs(data);
    } catch {}
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true); setError('');
    const form = new FormData();
    form.append('pdf', file);
    try {
      await api.post('/documents/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadDocs();
    } catch (err) {
      setError(err.response?.data?.error || '업로드 실패');
    } finally { setUploading(false); e.target.value = ''; }
  };

  const handleDelete = async (id) => {
    if (!confirm('문서를 삭제하시겠습니까?')) return;
    await api.delete(`/documents/${id}`);
    setDocs(docs.filter(d => d.id !== id));
  };

  const handleAccept = async (docId) => {
    await api.patch(`/documents/${docId}/shares/accept`);
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, my_signing_status: 'not_started' } : d));
    await loadDocs();
  };

  const handleDecline = async (docId) => {
    if (!confirm('초대를 거절하시겠습니까?')) return;
    await api.patch(`/documents/${docId}/shares/decline`);
    setDocs(prev => prev.filter(d => d.id !== docId));
  };

  const mineDocs = docs.filter(d => d.is_owner);
  const sharedDocs = docs.filter(d => !d.is_owner);
  const displayDocs = tab === 'mine' ? mineDocs : sharedDocs;
  const shareDoc = shareDocId ? docs.find(d => d.id === shareDocId) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <header style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 24px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>GreedySign</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#6b7280' }}>{user?.name}</span>
          <button onClick={logout} style={outlineBtnStyle}>로그아웃</button>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 0, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
            {[{ id: 'mine', label: `내 문서 (${mineDocs.length})` }, { id: 'shared', label: `공유받은 문서 (${sharedDocs.length})` }].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: tab === t.id ? 600 : 400, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#111' : '#6b7280', cursor: 'pointer', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                {t.label}
              </button>
            ))}
          </div>
          {tab === 'mine' && (
            <label style={{ ...primaryBtnStyle, cursor: 'pointer' }}>
              {uploading ? '업로드 중...' : '+ PDF 업로드'}
              <input type="file" accept=".pdf" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
            </label>
          )}
        </div>

        {error && <p style={{ color: '#e53e3e', marginBottom: 16, fontSize: 13 }}>{error}</p>}

        {displayDocs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>
            <p style={{ fontSize: 40, marginBottom: 12 }}>📄</p>
            <p style={{ fontSize: 16, marginBottom: 8 }}>{tab === 'mine' ? '문서가 없습니다' : '공유받은 문서가 없습니다'}</p>
            <p style={{ fontSize: 13 }}>{tab === 'mine' ? 'PDF를 업로드하여 시작하세요' : '다른 사람이 공유한 문서가 여기에 표시됩니다'}</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {displayDocs.map(doc => {
              const isPending = !doc.is_owner && doc.invite_status === 'pending';
              return (
                <div key={doc.id} style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 32 }}>📄</div>
                    {!doc.is_owner && doc.my_signing_status && (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: signingStatusColor[doc.my_signing_status] + '20', color: signingStatusColor[doc.my_signing_status], fontWeight: 500 }}>
                        {signingStatusLabel[doc.my_signing_status]}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</h3>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 2 }}>{doc.page_count}페이지 · {formatSize(doc.size_bytes)}</p>
                  <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 16 }}>{doc.owner_name} · {formatDate(doc.updated_at)}</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isPending ? (
                      <>
                        <button onClick={() => handleAccept(doc.id)} style={{ ...primaryBtnStyle, flex: 1, fontSize: 13 }}>수락</button>
                        <button onClick={() => handleDecline(doc.id)} style={{ ...outlineBtnStyle, color: '#e53e3e', borderColor: '#fca5a5' }}>거절</button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => onOpenDoc(doc.id)} style={{ ...primaryBtnStyle, flex: 1, fontSize: 13 }}>열기</button>
                        {doc.is_owner && (
                          <>
                            <button onClick={() => setShareDocId(doc.id)} style={{ ...outlineBtnStyle, fontSize: 13 }}>공유</button>
                            <button onClick={() => handleDelete(doc.id)} style={{ ...outlineBtnStyle, color: '#e53e3e', borderColor: '#fca5a5' }}>삭제</button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {shareDocId && shareDoc && (
        <ShareModal
          docId={shareDocId}
          mergeMode={shareDoc.merge_mode}
          onClose={() => setShareDocId(null)}
          onMergeModeChange={(mode) => setDocs(prev => prev.map(d => d.id === shareDocId ? { ...d, merge_mode: mode } : d))}
        />
      )}
    </div>
  );
}

const formatSize = (bytes) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const formatDate = (s) => new Date(s).toLocaleDateString('ko-KR');

const primaryBtnStyle = { display: 'inline-block', padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'center' };
const outlineBtnStyle = { padding: '7px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, cursor: 'pointer' };
const cardStyle = { background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #e5e7eb' };
