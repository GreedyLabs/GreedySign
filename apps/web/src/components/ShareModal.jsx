import { useState, useEffect } from 'react';
import api from '../services/api';

const statusLabel = {
  not_started: '미서명',
  in_progress: '진행 중',
  completed: '완료',
};
const statusColor = {
  not_started: '#9ca3af',
  in_progress: '#f59e0b',
  completed: '#10b981',
};
const inviteLabel = { pending: '대기', accepted: '수락', declined: '거절' };

export default function ShareModal({ docId, mergeMode, onClose, onMergeModeChange }) {
  const [shares, setShares] = useState([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadShares(); }, []);

  const loadShares = async () => {
    try {
      const { data } = await api.get(`/documents/${docId}/shares`);
      setShares(data);
    } catch {}
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true); setError('');
    try {
      await api.post(`/documents/${docId}/shares`, { email: email.trim() });
      setEmail('');
      await loadShares();
    } catch (err) {
      setError(err.response?.data?.error || '초대 실패');
    } finally { setLoading(false); }
  };

  const handleRevoke = async (shareId) => {
    if (!confirm('초대를 취소하시겠습니까?')) return;
    try {
      await api.delete(`/documents/${docId}/shares/${shareId}`);
      setShares(prev => prev.filter(s => s.share_id !== shareId));
    } catch (err) {
      alert(err.response?.data?.error || '취소 실패');
    }
  };

  const handleMergeModeChange = async (mode) => {
    try {
      await api.put(`/documents/${docId}/merge-mode`, { merge_mode: mode });
      onMergeModeChange?.(mode);
    } catch (err) {
      alert(err.response?.data?.error || '변경 실패');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>문서 공유 및 서명 관리</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* 병합 방식 */}
          <div style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>병합 방식</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'individual', label: '개별 병합', desc: '사용자별 분리 문서' },
                { value: 'combined', label: '합본 병합', desc: '모든 서명 한 문서에' },
              ].map(opt => (
                <button key={opt.value} onClick={() => handleMergeModeChange(opt.value)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid',
                    borderColor: mergeMode === opt.value ? '#3b82f6' : '#e5e7eb',
                    background: mergeMode === opt.value ? '#eff6ff' : '#fff',
                    color: mergeMode === opt.value ? '#1d4ed8' : '#374151',
                    cursor: 'pointer', textAlign: 'left',
                  }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 초대 입력 */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>서명자 초대</p>
            <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="이메일 주소 입력"
                style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, outline: 'none' }}
              />
              <button type="submit" disabled={loading || !email.trim()}
                style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {loading ? '...' : '초대'}
              </button>
            </form>
            {error && <p style={{ color: '#e53e3e', fontSize: 12, marginTop: 6 }}>{error}</p>}
          </div>

          {/* 공유 목록 */}
          {shares.length === 0 ? (
            <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '20px 0' }}>초대된 서명자가 없습니다</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {shares.map(s => (
                <div key={s.share_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.invitee_name}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>{s.invitee_email}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: '#f3f4f6', color: '#6b7280' }}>
                      {inviteLabel[s.invite_status]}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: statusColor[s.signing_status] + '20', color: statusColor[s.signing_status], fontWeight: 500 }}>
                      {statusLabel[s.signing_status]}
                    </span>
                    {s.placement_count > 0 && (
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>서명 {s.placement_count}개</span>
                    )}
                  </div>
                  <button onClick={() => handleRevoke(s.share_id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 14, padding: 4 }}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
