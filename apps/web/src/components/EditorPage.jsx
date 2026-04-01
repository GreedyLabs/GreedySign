import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { useDocSSE } from '../contexts/SSEContext';
import { useAuthStore } from '../stores/authStore';
import PdfViewer from './PdfViewer';
import EditLayer from './EditLayer';
import Sidebar from './Sidebar';
import { SIGNING_STATUS_QUERY_KEY } from './SigningStatusPanel';

export default function EditorPage({ docId, onBack }) {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const [fields, setFields] = useState([]);
  const [myValues, setMyValues] = useState([]);
  const [sigPlacements, setSigPlacements] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 1000 });
  const [zoomMode, setZoomMode] = useState('fit-height'); // 'fit-height' | 'fit-width' | number
  const [scale, setScale] = useState(1.4);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const viewerContainerRef = useRef(null);
  const pdfPageSizeRef = useRef({ pdfWidth: 595, pdfHeight: 842 }); // A4 fallback
  const pdfFirstRenderRef = useRef(false);

  const [activeTool, setActiveTool] = useState(null);
  const [activeSignature, setActiveSignature] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [viewingEmail, setViewingEmail] = useState(null);
  const [viewerPlacements, setViewerPlacements] = useState([]);
  const [viewerFields, setViewerFields] = useState([]);
  const [viewerValues, setViewerValues] = useState([]);

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
      queryClient.invalidateQueries({ queryKey: SIGNING_STATUS_QUERY_KEY(docId) });
    }
  }, [docId, queryClient]);

  useDocSSE(docId, handleSseEvent);

  const ZOOM_STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

  const calcFitScale = useCallback((mode) => {
    const container = viewerContainerRef.current;
    if (!container) return 1.4;
    const { pdfWidth, pdfHeight } = pdfPageSizeRef.current;
    const pad = 48; // padding 24px * 2
    if (mode === 'fit-height') {
      return (container.clientHeight - pad) / pdfHeight;
    } else {
      return (container.clientWidth - pad) / pdfWidth;
    }
  }, []);

  // fit 모드일 때 컨테이너 리사이즈에 따라 scale 재계산
  useEffect(() => {
    const container = viewerContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setZoomMode(prev => {
        if (prev === 'fit-height' || prev === 'fit-width') {
          setScale(calcFitScale(prev));
        }
        return prev;
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [calcFitScale]);

  const applyZoom = (mode) => {
    setZoomMode(mode);
    setDropdownOpen(false);
    if (mode === 'fit-height' || mode === 'fit-width') {
      setScale(calcFitScale(mode));
    } else {
      setScale(mode);
    }
  };

  const stepZoom = (dir) => {
    const currentScale = scale;
    if (dir === 1) {
      const next = ZOOM_STEPS.find(s => s > currentScale + 0.01);
      applyZoom(next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    } else {
      const next = [...ZOOM_STEPS].reverse().find(s => s < currentScale - 0.01);
      applyZoom(next ?? ZOOM_STEPS[0]);
    }
  };

  const zoomLabel = zoomMode === 'fit-height' ? '높이 맞춤'
    : zoomMode === 'fit-width' ? '너비 맞춤'
    : `${Math.round(scale * 100)}%`;

  const handlePageChange = (p) => {
    if (p < 1 || p > (doc?.page_count || 1)) return;
    setCurrentPage(p);
  };

  const handleWheel = useCallback((e) => {
    const el = viewerContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const atTop = el.scrollTop <= 4;
    if (e.deltaY > 0 && atBottom) {
      e.preventDefault();
      setCurrentPage(p => Math.min(p + 1, doc?.page_count || 1));
      el.scrollTop = 0;
    } else if (e.deltaY < 0 && atTop) {
      e.preventDefault();
      setCurrentPage(p => Math.max(p - 1, 1));
      // 이전 페이지로 이동 시 스크롤을 맨 아래로
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [doc?.page_count]);

  useEffect(() => {
    const el = viewerContainerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const handleViewSignatures = async (email) => {
    setViewingEmail(email);
    if (!email) { setViewerPlacements([]); setViewerFields([]); setViewerValues([]); return; }
    try {
      const { data } = await api.get(`/signatures/documents/${docId}/placements/${encodeURIComponent(email)}`);
      setViewerPlacements(data.placements || []);
      setViewerFields(data.fields || []);
      setViewerValues(data.fieldValues || []);
    } catch { setViewerPlacements([]); setViewerFields([]); setViewerValues([]); }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, position: 'relative' }}>
          <button onClick={() => stepZoom(-1)} style={zoomBtn}>−</button>
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{ ...zoomBtn, width: 'auto', padding: '0 10px', fontSize: 12, color: '#374151', gap: 4, minWidth: 80 }}>
            {zoomLabel} ▾
          </button>
          <button onClick={() => stepZoom(1)} style={zoomBtn}>+</button>
          {dropdownOpen && (
            <div style={{ position: 'absolute', top: 34, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 100, minWidth: 140, overflow: 'hidden' }}
              onMouseDown={e => e.preventDefault()}>
              {[
                { label: '높이에 맞춤', value: 'fit-height' },
                { label: '너비에 맞춤', value: 'fit-width' },
                null,
                { label: '50%', value: 0.5 },
                { label: '75%', value: 0.75 },
                { label: '100%', value: 1.0 },
                { label: '125%', value: 1.25 },
                { label: '150%', value: 1.5 },
                { label: '200%', value: 2.0 },
              ].map((item, i) => item === null
                ? <div key={i} style={{ height: 1, background: '#f3f4f6', margin: '4px 0' }} />
                : (
                  <button key={item.value} onClick={() => applyZoom(item.value)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 14px', background: zoomMode === item.value ? '#eff6ff' : 'transparent', border: 'none', fontSize: 13, color: zoomMode === item.value ? '#3b82f6' : '#374151', cursor: 'pointer', textAlign: 'left' }}>
                    {item.label}
                    {zoomMode === item.value && <span style={{ fontSize: 11 }}>✓</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
          <div ref={viewerContainerRef} style={{ flex: 1, overflow: 'auto', background: '#6b7280', display: 'flex', justifyContent: 'center', padding: '24px' }} onClick={() => setDropdownOpen(false)}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <PdfViewer
                pdfUrl={`/api/documents/${docId}/pdf`}
                currentPage={currentPage}
                scale={scale}
                token={token}
                onPageRendered={({ width, height, pdfWidth, pdfHeight, scale: s }) => {
                  pdfPageSizeRef.current = { pdfWidth, pdfHeight };
                  // 첫 렌더 시 fit-height scale 적용
                  if (!pdfFirstRenderRef.current) {
                    pdfFirstRenderRef.current = true;
                    setScale(calcFitScale('fit-height'));
                  }
                  setCanvasSize({ width, height, pdfWidth, pdfHeight, scale: s });
                }}
              />
              <EditLayer
                docId={docId}
                fields={fields} setFields={setFields}
                myValues={myValues} setMyValues={setMyValues}
                sigPlacements={sigPlacements} setSigPlacements={setSigPlacements}
                viewerPlacements={viewerPlacements}
                viewerFields={viewerFields}
                viewerValues={viewerValues}
                canvasSize={canvasSize}
                currentPage={currentPage}
                activeTool={activeTool}
                activeSignature={activeSignature}
                onToolUsed={() => setActiveTool(null)}
                readOnly={signingDone}
              />
            </div>
          </div>
        </div>

        <Sidebar
          docId={docId}
          isOwner={isOwner}
          signingDone={signingDone}
          onSubmitSigning={handleSubmitSigning}
          onCancelSigning={handleCancelSigning}
          activeTool={activeTool} setActiveTool={setActiveTool}
          activeSignature={activeSignature} setActiveSignature={setActiveSignature}
          signatures={signatures} setSignatures={(updater) => {
            queryClient.setQueryData(['signatures'], typeof updater === 'function' ? updater : () => updater);
          }}
          onExport={handleExport} exporting={exporting}
          onViewSignatures={handleViewSignatures} viewingEmail={viewingEmail}
          currentPage={currentPage} totalPages={doc?.page_count || 1}
          onPageChange={handlePageChange}
        />
      </div>
    </div>
  );
}

const zoomBtn = { height: 28, width: 28, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };
