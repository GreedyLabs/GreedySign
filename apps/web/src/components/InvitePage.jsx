import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';

export default function InvitePage({ token, onAccepted }) {
  const { user } = useAuthStore();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api.get(`/invite/${token}`)
      .then(({ data }) => setInfo(data))
      .catch(err => setError(err.response?.data?.error || '유효하지 않은 초대 링크입니다'));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { data } = await api.post(`/invite/${token}/accept`);
      onAccepted(data.document_id);
    } catch (err) {
      setError(err.response?.data?.error || '수락 실패');
    } finally {
      setAccepting(false);
    }
  };

  if (error) return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>⚠️</p>
        <p style={{ color: '#ef4444', fontWeight: 500, marginBottom: 8 }}>{error}</p>
        <p style={{ fontSize: 13, color: '#9ca3af' }}>링크가 만료되었거나 잘못된 링크입니다.</p>
      </div>
    </div>
  );

  if (!info) return (
    <div style={centerStyle}>
      <p style={{ color: '#6b7280' }}>초대 정보 확인 중...</p>
    </div>
  );

  // 로그인된 이메일과 초대 이메일 불일치 경고
  const emailMismatch = user && user.email.toLowerCase() !== info.invitee_email.toLowerCase();

  return (
    <div style={centerStyle}>
      <div style={cardStyle}>
        <p style={{ fontSize: 32, marginBottom: 12 }}>📄</p>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>서명 요청</h2>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 4 }}>
          <strong>{info.owner_name}</strong>님이 서명을 요청했습니다
        </p>
        <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 20 }}>"{info.doc_name}"</p>

        {emailMismatch && (
          <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
            이 초대는 <strong>{info.invitee_email}</strong> 계정용입니다.<br />
            현재 <strong>{user.email}</strong>으로 로그인되어 있습니다.
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting || emailMismatch}
          style={{
            width: '100%', padding: '11px', borderRadius: 8, border: 'none',
            background: emailMismatch ? '#e5e7eb' : '#3b82f6',
            color: emailMismatch ? '#9ca3af' : '#fff',
            fontSize: 14, fontWeight: 500,
            cursor: emailMismatch ? 'not-allowed' : 'pointer',
          }}>
          {accepting ? '처리 중...' : '수락하고 문서 열기'}
        </button>

        {emailMismatch && (
          <p style={{ marginTop: 10, fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>
            {info.invitee_email} 계정으로 다시 로그인해주세요
          </p>
        )}
      </div>
    </div>
  );
}

const centerStyle = { height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb' };
const cardStyle = { background: '#fff', borderRadius: 16, padding: '36px 32px', width: 360, textAlign: 'center', boxShadow: '0 4px 24px rgba(0,0,0,0.08)' };
