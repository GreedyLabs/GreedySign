import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { useUserSSE } from '../contexts/SSEContext';

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

export default function ShareModal({ docId, onClose }) {
  const [shares, setShares] = useState([]);
  const [pendingEmails, setPendingEmails] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const searchTimer = useRef(null);

  useEffect(() => { loadShares(); }, []);

  const loadShares = async () => {
    try {
      const { data } = await api.get(`/documents/${docId}/shares`);
      setShares(data);
    } catch {}
  };

  const handleUserEvent = useCallback((msg) => {
    if (msg.type === 'share_status_changed' && msg.document_id === docId) {
      loadShares();
    }
  }, [docId]);

  useUserSSE(handleUserEvent);

  const commitInput = (value) => {
    const addr = value.trim();
    if (addr && !pendingEmails.includes(addr)) {
      setPendingEmails(prev => [...prev, addr]);
    }
    setInputValue('');
    setSuggestions([]);
  };

  const handleInputKeyDown = (e) => {
    if (e.key === ',' || e.key === 'Enter') {
      e.preventDefault();
      commitInput(inputValue);
    } else if (e.key === 'Backspace' && inputValue === '' && pendingEmails.length) {
      setPendingEmails(prev => prev.slice(0, -1));
    } else if (e.key === 'Escape') {
      setSuggestions([]);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    if (val.endsWith(',')) {
      commitInput(val.slice(0, -1));
      return;
    }
    setInputValue(val);
    clearTimeout(searchTimer.current);
    if (val.trim().length < 1) { setSuggestions([]); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await api.get(`/auth/users/search?q=${encodeURIComponent(val.trim())}`);
        setSuggestions(data.filter(u => !pendingEmails.includes(u.email)));
      } catch {}
    }, 200);
  };

  const selectSuggestion = (user) => {
    if (!pendingEmails.includes(user.email)) {
      setPendingEmails(prev => [...prev, user.email]);
    }
    setInputValue('');
    setSuggestions([]);
  };

  const removePending = (addr) => setPendingEmails(prev => prev.filter(e => e !== addr));

  const handleInvite = async (e) => {
    e.preventDefault();
    const extra = inputValue.trim();
    const emails = extra ? [...pendingEmails, extra] : [...pendingEmails];
    if (!emails.length) return;
    setLoading(true); setError('');
    const errors = [];
    const reInvited = [];
    const existingEmails = new Set(shares.map(s => s.invitee_email));
    for (const addr of emails) {
      try {
        await api.post(`/documents/${docId}/shares`, { email: addr });
        if (existingEmails.has(addr)) reInvited.push(addr);
      } catch (err) {
        errors.push(`${addr}: ${err.response?.data?.error || '초대 실패'}`);
      }
    }
    setPendingEmails([]);
    setInputValue('');
    await loadShares();
    if (errors.length) setError(errors.join('\n'));
    else if (reInvited.length) setError(`재초대 완료: ${reInvited.join(', ')} (초대 메일이 재발송되었습니다)`);
    setLoading(false);
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


  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 480, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>문서 공유 및 서명 관리</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>×</button>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {/* 초대 입력 */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>서명자 초대</p>
            <form onSubmit={handleInvite}>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 8, marginBottom: 8, minHeight: 38, alignItems: 'center' }}>
                  {pendingEmails.map(addr => (
                    <span key={addr} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', background: '#eff6ff', color: '#1d4ed8', borderRadius: 12, fontSize: 12, fontWeight: 500 }}>
                      {addr}
                      <button type="button" onClick={() => removePending(addr)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                    placeholder={pendingEmails.length ? '' : '이메일 입력 후 쉼표 또는 Enter'}
                    style={{ flex: 1, minWidth: 160, border: 'none', outline: 'none', fontSize: 13, padding: '2px 4px' }}
                  />
                </div>
                {suggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden' }}>
                    {suggestions.map(u => (
                      <button key={u.email} type="button" onMouseDown={() => selectSuggestion(u)}
                        style={{ width: '100%', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#111' }}>{u.name}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{u.email}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {pendingEmails.length > 0
                  ? <span style={{ fontSize: 12, color: '#6b7280' }}>{pendingEmails.length + (inputValue.trim() ? 1 : 0)}명 초대 예정</span>
                  : <span />}
                <button type="submit" disabled={loading || (pendingEmails.length === 0 && !inputValue.trim())}
                  style={{ padding: '7px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: (loading || (pendingEmails.length === 0 && !inputValue.trim())) ? 0.5 : 1 }}>
                  {loading ? '처리 중...' : '초대'}
                </button>
              </div>
            </form>
            {error && (
              <p style={{ color: error.startsWith('재초대') ? '#2563eb' : '#e53e3e', fontSize: 12, marginTop: 6, whiteSpace: 'pre-line' }}>{error}</p>
            )}
          </div>

          {/* 공유 목록 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>서명자 목록</p>
            {shares.length > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>총 {shares.length}명</span>}
          </div>
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
