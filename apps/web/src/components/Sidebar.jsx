import { useState } from 'react';
import SignatureModal from './SignatureModal';
import SigningStatusPanel from './SigningStatusPanel';
import api from '../services/api';

export default function Sidebar({
  docId, isOwner, signingDone, onSubmitSigning, onCancelSigning,
  activeTool, setActiveTool, activeSignature, setActiveSignature,
  signatures, setSignatures, onExport, exporting,
  currentPage, totalPages, onPageChange,
  onViewSignatures, viewingEmail,
}) {
  const [showSigModal, setShowSigModal] = useState(false);
  const [editingSig, setEditingSig] = useState(null);

  const deleteSig = async (id, e) => {
    e.stopPropagation();
    await api.delete(`/signatures/${id}`);
    setSignatures(prev => prev.filter(s => s.id !== id));
    if (activeSignature?.id === id) setActiveSignature(null);
  };

  const tools = [
    { id: 'text', label: '텍스트 필드', icon: 'T' },
    { id: 'checkbox', label: '체크박스', icon: '☑' },
    { id: 'signature', label: '서명 배치', icon: '✍' },
  ];

  return (
    <aside style={{ width: 260, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>도구</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tools.map(t => (
            <button key={t.id} onClick={() => setActiveTool(activeTool === t.id ? null : t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                borderRadius: 8, border: '1px solid',
                borderColor: activeTool === t.id ? '#3b82f6' : '#e5e7eb',
                background: activeTool === t.id ? '#eff6ff' : '#fff',
                color: activeTool === t.id ? '#3b82f6' : '#374151',
                cursor: 'pointer', fontSize: 13, fontWeight: activeTool === t.id ? 500 : 400,
              }}>
              <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', flex: 1, overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>내 서명</p>
          <button onClick={() => setShowSigModal(true)}
            style={{ fontSize: 12, padding: '4px 8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            + 추가
          </button>
        </div>

        {signatures.length === 0 && (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>저장된 서명이 없습니다</p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signatures.map(sig => (
            <div key={sig.id} onClick={() => { setActiveSignature(sig); setActiveTool('signature'); }}
              style={{
                border: '1px solid',
                borderColor: activeSignature?.id === sig.id ? '#8b5cf6' : '#e5e7eb',
                borderRadius: 8, padding: '8px', cursor: 'pointer',
                background: activeSignature?.id === sig.id ? '#f5f3ff' : '#fff',
                position: 'relative',
              }}>
              <div style={{ height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9fafb', borderRadius: 6, marginBottom: 6 }}>
                {sig.thumbnail
                  ? <img src={sig.thumbnail} alt={sig.name} style={{ maxHeight: 44, maxWidth: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: 12, color: '#9ca3af' }}>미리보기 없음</span>
                }
              </div>
              <p style={{ fontSize: 12, color: '#374151', textAlign: 'center' }}>{sig.name}</p>
              <button onClick={e => { e.stopPropagation(); setEditingSig(sig); setShowSigModal(true); }}
                style={{ position: 'absolute', top: 4, right: 22, background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 13 }}>✎</button>
              <button onClick={e => deleteSig(sig.id, e)}
                style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 14 }}>×</button>
            </div>
          ))}
        </div>
      </div>

      {isOwner && <SigningStatusPanel docId={docId} onViewSignatures={onViewSignatures} viewingEmail={viewingEmail} />}

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>◀</button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 13, color: '#374151' }}>{currentPage} / {totalPages}</span>
          <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages}
            style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>▶</button>
        </div>

        {!isOwner && (
          signingDone ? (
            <>
              <button disabled
                style={{ width: '100%', padding: '9px', background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'default' }}>
                ✓ 서명 완료됨
              </button>
              <button onClick={onCancelSigning}
                style={{ width: '100%', padding: '9px', background: '#fff', color: '#6b7280', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                취소
              </button>
            </>
          ) : (
            <button onClick={onSubmitSigning}
              style={{ width: '100%', padding: '9px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              서명 완료
            </button>
          )
        )}

        <button onClick={() => onExport('individual')} disabled={exporting}
          style={{ width: '100%', padding: '9px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          {exporting ? '생성 중...' : '⬇ 내 서명 내보내기'}
        </button>

        {isOwner && (
          <>
            <button onClick={() => onExport('combined')} disabled={exporting}
              style={{ width: '100%', padding: '9px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {exporting ? '생성 중...' : '⬇ 합본 내보내기'}
            </button>
            <button onClick={() => onExport('bulk')} disabled={exporting}
              style={{ width: '100%', padding: '9px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              {exporting ? '생성 중...' : '⬇ 개별 일괄 내보내기 (ZIP)'}
            </button>
          </>
        )}
      </div>

      {showSigModal && (
        <SignatureModal
          editing={editingSig}
          onClose={() => { setShowSigModal(false); setEditingSig(null); }}
          onSaved={sig => {
            setSignatures(prev => editingSig
              ? prev.map(s => s.id === sig.id ? sig : s)
              : [sig, ...prev]
            );
          }}
        />
      )}
    </aside>
  );
}
