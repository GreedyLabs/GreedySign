import { useEffect, useState } from 'react';
import api from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { useNavigate, useParams } from '../lib/router';

export default function InvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    api
      .get(`/invite/${token}`)
      .then(({ data }) => setInfo(data))
      .catch((err) => setError(err.response?.data?.error ?? '유효하지 않은 초대 링크입니다'));
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { data } = await api.post(`/invite/${token}/accept`);
      navigate(`/docs/${data.document_id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error ?? '수락 실패');
      setAccepting(false);
    }
  };

  const emailMismatch = user && info && user.email.toLowerCase() !== info.email.toLowerCase();

  if (error)
    return (
      <div className="gs-invite">
        <div className="gs-invite-card" style={{ padding: 32, textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'var(--color-danger-subtle)',
                border: '1px solid var(--color-danger)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-danger)',
              }}
            >
              <svg
                width={24}
                height={24}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
            </div>
          </div>
          <h2
            style={{ fontSize: 17, fontWeight: 600, marginBottom: 6, color: 'var(--color-text)' }}
          >
            초대 링크 오류
          </h2>
          <p
            style={{
              fontSize: 13.5,
              color: 'var(--color-danger)',
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            {error}
          </p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            링크가 만료되었거나 잘못된 링크입니다.
          </p>
        </div>
      </div>
    );

  if (!info)
    return (
      <div className="gs-invite">
        <div className="col gap-3" style={{ alignItems: 'center' }}>
          <div className="gs-spinner" />
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>초대 정보 확인 중...</p>
        </div>
      </div>
    );

  return (
    <div className="gs-invite">
      <div className="gs-invite-card" style={{ padding: 32 }}>
        {/* Doc icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-card)',
              background: 'var(--color-primary-subtle)',
              border: '1px solid var(--color-primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-primary)',
            }}
          >
            <svg
              width={26}
              height={26}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          </div>
        </div>

        <div className="t-caption" style={{ marginBottom: 8, textAlign: 'center' }}>
          {info.role === 'cc' ? '참조 알림' : '서명 요청'}
        </div>
        <h2
          style={{
            fontSize: 17,
            fontWeight: 600,
            marginBottom: 6,
            color: 'var(--color-text)',
            textAlign: 'center',
          }}
        >
          {info.owner_name}님이 {info.role === 'cc' ? '문서를 공유했습니다' : '서명을 요청했습니다'}
        </h2>
        <p
          style={{
            fontSize: 14.5,
            fontWeight: 500,
            marginBottom: 20,
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
            padding: '10px 16px',
            background: 'var(--color-bg-subtle)',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--color-border)',
          }}
        >
          "{info.doc_name}"
        </p>

        {emailMismatch && (
          <div
            style={{
              background: 'var(--color-warning-subtle)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-control)',
              padding: '10px 14px',
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-warning)',
              lineHeight: 1.6,
            }}
          >
            이 초대는 <strong>{info.email}</strong> 계정용입니다.
            <br />
            현재 <strong>{user.email}</strong>으로 로그인되어 있습니다.
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting || emailMismatch}
          className={`btn btn-block${emailMismatch ? ' btn-secondary' : ' btn-primary'}`}
          style={{ fontWeight: 600 }}
        >
          {accepting
            ? '처리 중…'
            : emailMismatch
              ? '계정 불일치 — 수락 불가'
              : info.role === 'cc'
                ? '확인하고 문서 열기'
                : '수락하고 서명하기'}
        </button>

        {emailMismatch && (
          <p
            style={{
              marginTop: 10,
              fontSize: 12,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
            }}
          >
            {info.email} 계정으로 다시 로그인해주세요
          </p>
        )}
      </div>
    </div>
  );
}
