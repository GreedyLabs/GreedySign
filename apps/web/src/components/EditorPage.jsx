import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { connectSSE, disconnectSSE } from '../services/sse';
import { useAuthStore } from '../stores/authStore';
import PdfViewer from './PdfViewer';
import EditLayer from './EditLayer';
import Sidebar from './Sidebar';
import { refreshSigningStatus } from './SigningStatusPanel';

export default function EditorPage({ docId, onBack }) {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState([]);
  const [myValues, setMyValues] = useState([]);
  const [sigPlacements, setSigPlacements] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 1000 });
  const [scale, setScale] = useState(1.4);

  const [activeTool, setActiveTool] = useState(null);
  const [activeSignature, setActiveSignature] = useState(null);
  const [exporting, setExporting] = useState(false);

  const { data: doc, isLoading: docLoading, error: docError } = useQuery({
    queryKey: ['document', docId],
    queryFn: async () => {
      const { data } = await api.get(`/documents/${docId}`);
      return data;
    },
  });

  const { data: signatures = [] } = useQuery({
    queryKey: ['signatures'],
    queryFn: async () => {
      const { data } = await api.get('/signatures');
      return data;
    },
  });

  // Sync server data into local editing state when doc first loads
  useEffect(() => {
    if (!doc) return;
    setFields(doc.fields || []);
    setMyValues(doc.myValues || []);
    setSigPlacements(doc.mySignatures || []);

    if (doc.is_owner === false && doc.my_signing_status === 'not_started') {
      api.patch(`/documents/${docId}/signing/status`, { status: 'in_progress' }).catch(() => {});
    }
  }, [doc?.id]);  // only on first load (doc.id is stable)

  // SSE
  const handleSseEvent = useCallback((msg) => {
    if (msg.type === 'signing_status_changed') {
      refreshSigningStatus();
    }
  }, []);

  useEffect(() => {
    connectSSE(docId, handleSseEvent);
    return () => disconnectSSE();
  }, [docId]);

  const handlePageChange = (p) => {
    if (p < 1 || p > (doc?.page_count || 1)) return;
    setCurrentPage(p);
  };

  const handleSubmitSigning = async () => {
    try {
      await api.patch(`/documents/${docId}/signing/status`, { status: 'completed' });
      queryClient.setQueryData(['document', docId], (prev) =>
        prev ? { ...prev, my_signing_status: 'completed' } : prev
      );
    } catch (err) {
      alert('서명 제출 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleCancelSigning = async () => {
    if (!confirm('서명을 취소하고 다시 편집하시겠습니까?')) return;
    try {
      await api.patch(`/documents/${docId}/signing/status`, { status: 'in_progress' });
      queryClient.setQueryData(['document', docId], (prev) =>
        prev ? { ...prev, my_signing_status: 'in_progress' } : prev
      );
    } catch (err) {
      alert('서명 취소 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleExport = async (mode = 'individual') => {
    setExporting(true);
    try {
      if (mode === 'bulk') {
        const resp = await api.post(`/documents/${docId}/export/bulk-individual`, {}, { responseType: 'blob' });
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = (doc?.name || 'document').replace('.pdf', '') + '_individual_exports.zip';
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const resp = await api.post(`/documents/${docId}/export`, { mode }, { responseType: 'blob' });
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        const suffix = mode === 'combined' ? '_combined_signed.pdf' : '_signed.pdf';
        a.download = (doc?.name || 'document').replace('.pdf', '') + suffix;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      alert('내보내기 실패: ' + (err.response?.data?.error || err.message));
    } finally { setExporting(false); }
  };

  if (docLoading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#6b7280' }}>문서 불러오는 중...</p>
    </div>
  );

  if (docError) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#ef4444' }}>문서를 불러올 수 없습니다.</p>
    </div>
  );

  const isOwner = doc?.is_owner;
  const signingDone = doc?.my_signing_status === 'completed';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ height: 52, background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 20 }}>←</button>
        <h2 style={{ fontSize: 15, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc?.name}</h2>
        {activeTool && (
          <span style={{ fontSize: 12, padding: '4px 10px', background: '#eff6ff', color: '#3b82f6', borderRadius: 20, fontWeight: 500 }}>
            {activeTool === 'text' ? '텍스트 필드' : activeTool === 'checkbox' ? '체크박스' : '서명 배치'} — PDF를 클릭하세요
          </span>
        )}
        {!isOwner && (
          signingDone ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#065f46', background: '#d1fae5', padding: '6px 14px', borderRadius: 8 }}>
                서명 완료됨
              </span>
              <button onClick={handleCancelSigning}
                style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>
                취소
              </button>
            </div>
          ) : (
            <button onClick={handleSubmitSigning}
              style={{ padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', background: '#10b981', color: '#fff' }}>
              서명 완료
            </button>
          )
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} style={zoomBtn}>-</button>
          <span style={{ fontSize: 12, color: '#6b7280', minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale(s => Math.min(3, s + 0.2))} style={zoomBtn}>+</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', background: '#6b7280', display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <PdfViewer
              pdfUrl={`/api/documents/${docId}/pdf`}
              currentPage={currentPage}
              scale={scale}
              token={token}
              onPageRendered={({ width, height, pdfWidth, pdfHeight, scale: s }) => setCanvasSize({ width, height, pdfWidth, pdfHeight, scale: s })}
            />
            <EditLayer
              docId={docId}
              fields={fields} setFields={setFields}
              myValues={myValues} setMyValues={setMyValues}
              sigPlacements={sigPlacements} setSigPlacements={setSigPlacements}
              canvasSize={canvasSize}
              currentPage={currentPage}
              activeTool={activeTool}
              activeSignature={activeSignature}
              onToolUsed={() => setActiveTool(null)}
            />
          </div>
        </div>

        <Sidebar
          docId={docId}
          isOwner={isOwner}
          activeTool={activeTool} setActiveTool={setActiveTool}
          activeSignature={activeSignature} setActiveSignature={setActiveSignature}
          signatures={signatures} setSignatures={(updater) => {
            queryClient.setQueryData(['signatures'], typeof updater === 'function' ? updater : () => updater);
          }}
          onExport={handleExport} exporting={exporting}
          currentPage={currentPage} totalPages={doc?.page_count || 1}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}

const zoomBtn = { width: 28, height: 28, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' };
