import { useState } from 'react';
import SignatureModal from './SignatureModal';
import SigningStatusPanel from './SigningStatusPanel';
import api from '../services/api';

// ─── Tiny icons ─────────────────────────────────────────────
const PlusIcon = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
  >
    <path d="M8 3v10M3 8h10" />
  </svg>
);
const EditIcon = () => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <path d="m11 2 3 3-9 9H2v-3L11 2Z" />
  </svg>
);
const TrashIcon = () => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
  </svg>
);
const DownloadIcon = () => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <path d="M8 2v9M5 9l3 3 3-3M2 13h12" />
  </svg>
);
const ArchiveIcon = () => (
  <svg
    width={13}
    height={13}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
  >
    <rect x="1" y="2" width="14" height="4" rx="1" />
    <path d="M2 6v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6M6 9h4" />
  </svg>
);

// ─── EditorSidebar ──────────────────────────────────────────
// Tool palette and signing submit/cancel have been moved to the EditorPage
// header toolbar to avoid duplication. This sidebar focuses on:
//   1. Signing status overview (owner only)
//   2. Signature library (all users)
//   3. Export options
export default function EditorSidebar({
  docId,
  isOwner,
  activeTool,
  setActiveTool,
  activeSignature,
  setActiveSignature,
  signatures,
  setSignatures,
  onExport,
  exporting,
  onViewSignatures,
  viewingEmail,
}) {
  const [showSigModal, setShowSigModal] = useState(false);
  const [editingSig, setEditingSig] = useState(null);

  const deleteSig = async (id, e) => {
    e.stopPropagation();
    if (!confirm('서명을 삭제하시겠습니까?')) return;
    await api.delete(`/signatures/${id}`);
    setSignatures((prev) => prev.filter((s) => s.id !== id));
    if (activeSignature?.id === id) setActiveSignature(null);
  };

  return (
    <div className="gs-ed-right">
      {/* ── 서명 현황 (소유자만) ── */}
      {isOwner && (
        <div className="gs-ed-section">
          <SigningStatusPanel
            docId={docId}
            onViewSignatures={onViewSignatures}
            viewingEmail={viewingEmail}
          />
        </div>
      )}

      {/* ── 내 서명 라이브러리 ── */}
      <div className="gs-ed-section">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div className="t-eyebrow">내 서명</div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setEditingSig(null);
              setShowSigModal(true);
            }}
          >
            <PlusIcon /> 추가
          </button>
        </div>

        {signatures.length === 0 && (
          <div
            style={{
              padding: '20px 0',
              textAlign: 'center',
              fontSize: 12,
              color: 'var(--color-text-muted)',
            }}
          >
            저장된 서명이 없습니다
          </div>
        )}

        <div className="col gap-2">
          {signatures.map((sig) => (
            <div
              key={sig.id}
              onClick={() => {
                setActiveSignature(sig);
                setActiveTool('signature');
              }}
              style={{
                border: `1px solid ${activeSignature?.id === sig.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-card)',
                padding: 8,
                cursor: 'pointer',
                background:
                  activeSignature?.id === sig.id
                    ? 'var(--color-primary-subtle)'
                    : 'var(--color-surface)',
                position: 'relative',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              <div
                style={{
                  height: 48,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#fff',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: 6,
                  border: '1px solid var(--color-border-subtle)',
                }}
              >
                {sig.thumbnail ? (
                  <img
                    src={sig.thumbnail}
                    alt={sig.name}
                    style={{ maxHeight: 44, maxWidth: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    미리보기 없음
                  </span>
                )}
              </div>
              <div className="row-between">
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                  {sig.name}
                </p>
                <div className="row gap-1">
                  <button
                    className="icon-btn"
                    style={{ width: 22, height: 22 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingSig(sig);
                      setShowSigModal(true);
                    }}
                  >
                    <EditIcon />
                  </button>
                  <button
                    className="icon-btn"
                    style={{ width: 22, height: 22, color: 'var(--color-danger)' }}
                    onClick={(e) => deleteSig(sig.id, e)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              {activeSignature?.id === sig.id && (
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--color-primary)',
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Usage hint */}
        {activeSignature && activeTool === 'signature' && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              background: 'var(--color-primary-subtle)',
              border: '1px solid var(--color-primary-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              color: 'var(--color-primary)',
            }}
          >
            PDF 위를 클릭해 서명을 배치하세요
          </div>
        )}
      </div>

      {/* ── 내보내기 ── */}
      <div className="gs-ed-section">
        <div className="t-eyebrow" style={{ marginBottom: 10 }}>
          내보내기
        </div>
        <div className="col gap-2">
          <button
            className="btn btn-secondary btn-block"
            onClick={() => onExport('individual')}
            disabled={exporting}
            style={{ justifyContent: 'flex-start', gap: 8 }}
          >
            <DownloadIcon />
            {exporting ? '생성 중…' : '내 서명 PDF'}
          </button>
          {isOwner && (
            <>
              <button
                className="btn btn-primary btn-block"
                onClick={() => onExport('combined')}
                disabled={exporting}
                style={{ justifyContent: 'flex-start', gap: 8 }}
              >
                <DownloadIcon />
                {exporting ? '생성 중…' : '합본 PDF (모든 서명)'}
              </button>
              <button
                className="btn btn-secondary btn-block"
                onClick={() => onExport('bulk')}
                disabled={exporting}
                style={{ justifyContent: 'flex-start', gap: 8 }}
              >
                <ArchiveIcon />
                {exporting ? '생성 중…' : '개별 일괄 내보내기 (ZIP)'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── 서명 모달 ── */}
      {showSigModal && (
        <SignatureModal
          editing={editingSig}
          onClose={() => {
            setShowSigModal(false);
            setEditingSig(null);
          }}
          onSaved={(sig) => {
            setSignatures((prev) =>
              editingSig ? prev.map((s) => (s.id === sig.id ? sig : s)) : [sig, ...prev]
            );
          }}
        />
      )}
    </div>
  );
}
