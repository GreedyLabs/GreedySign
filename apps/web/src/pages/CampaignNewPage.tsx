/**
 * CampaignNewPage — 캠페인 생성 마법사 (3 steps).
 *   1. 템플릿 선택 (쿼리 ?template=:id가 있으면 스킵)
 *   2. 수신자 추가 (직접 입력 / CSV / 클립보드 붙여넣기)
 *   3. 이름·메시지 확인 + 발송
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateCampaignBody,
  AddRecipientsBody,
} from '@greedylabs/greedysign-shared';
import api, { ApiError } from '../services/api';
import { API_ENDPOINTS } from '../services/endpoints';
import { useNavigate, useSearchParams } from '../lib/router';
import PageHeader from '../components/ui/PageHeader';
import { CheckIcon } from '../components/ui/Icon';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Types ────────────────────────────────────────────────
interface TemplateItem {
  id: number | string;
  name: string;
  status: string;
  page_count?: number;
  field_count?: number;
  fields?: unknown[];
}

interface Recipient {
  email: string;
  name: string | null;
}

interface DispatchResult {
  success: number;
  failed: number;
  total: number;
  [key: string]: unknown;
}

interface CreatedCampaign {
  id: number | string;
  [key: string]: unknown;
}

type StepValue = 1 | 2 | 3;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  return fallback;
}

function useQueryParam(name: string): string | null {
  const [params] = useSearchParams();
  return params.get(name);
}

// ─── Step indicator ───────────────────────────────────────
function Stepper({ current }: { current: StepValue }) {
  const steps = ['템플릿', '수신자', '확인 & 발송'];
  return (
    <div className="row gap-2" style={{ alignItems: 'center', marginBottom: 24 }}>
      {steps.map((label, i) => {
        const idx = i + 1;
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 600,
                background: isActive
                  ? 'var(--color-primary)'
                  : isDone
                    ? 'var(--color-success)'
                    : 'var(--color-bg-subtle)',
                color: isActive || isDone ? 'white' : 'var(--color-text-muted)',
              }}
            >
              {isDone ? <CheckIcon size={14} strokeWidth={2} /> : idx}
            </div>
            <div
              style={{
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                color: isActive
                  ? 'var(--color-text)'
                  : isDone
                    ? 'var(--color-success)'
                    : 'var(--color-text-muted)',
              }}
            >
              {label}
            </div>
            {idx < steps.length && (
              <div
                style={{
                  width: 36,
                  height: 1,
                  background: 'var(--color-border)',
                  marginLeft: 4,
                  marginRight: 4,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: template select ─────────────────────────────
interface TemplateStepProps {
  onSelect: (t: TemplateItem) => void;
}

function TemplateStep({ onSelect }: TemplateStepProps) {
  const { data: templates = [], isLoading } = useQuery<TemplateItem[]>({
    queryKey: ['templates'],
    queryFn: async () => {
      const { data } = await api.get<TemplateItem[]>(API_ENDPOINTS.templates.list);
      return data;
    },
  });
  const ready = templates.filter((t) => t.status === 'ready');

  if (isLoading) return <div className="gs-spinner" />;
  if (ready.length === 0) {
    return (
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--radius-card)',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
          배포 가능한 템플릿이 없습니다
        </div>
        <div className="t-caption">
          템플릿에 필드를 배치하고 "배포 준비 완료"를 눌러야 캠페인으로 사용할 수 있습니다.
        </div>
      </div>
    );
  }

  return (
    <div className="col gap-2">
      {ready.map((t) => (
        <div
          key={t.id}
          onClick={() => onSelect(t)}
          style={{
            padding: 16,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-surface)',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{t.name}</div>
            <div className="t-caption">
              필드 {t.field_count ?? 0}개 · {t.page_count}페이지
            </div>
          </div>
          <button className="btn btn-primary btn-sm">선택</button>
        </div>
      ))}
    </div>
  );
}

// ─── Step 2: recipients ───────────────────────────────────
interface RecipientsStepProps {
  recipients: Recipient[];
  setRecipients: (next: Recipient[]) => void;
}

interface SkippedLine {
  line: string;
  reason: string;
}

function RecipientsStep({ recipients, setRecipients }: RecipientsStepProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');

  const addOne = () => {
    const e = email.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) {
      alert('유효한 이메일이 아닙니다');
      return;
    }
    if (recipients.some((r) => r.email === e)) {
      alert('이미 추가된 이메일입니다');
      return;
    }
    setRecipients([...recipients, { email: e, name: name.trim() || null }]);
    setEmail('');
    setName('');
  };

  const parseBulk = () => {
    const lines = bulk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: Recipient[] = [];
    const skipped: SkippedLine[] = [];
    const seen = new Set(recipients.map((r) => r.email));
    for (const line of lines) {
      // CSV 한 줄: email, name  / 또는 email
      const parts = line.split(/[,;\t]/).map((p) => p.trim());
      const em = (parts[0] ?? '').toLowerCase();
      const nm = parts[1] || null;
      if (!EMAIL_RE.test(em)) {
        skipped.push({ line, reason: '이메일 아님' });
        continue;
      }
      if (seen.has(em)) {
        skipped.push({ line, reason: '중복' });
        continue;
      }
      seen.add(em);
      parsed.push({ email: em, name: nm });
    }
    setRecipients([...recipients, ...parsed]);
    if (parsed.length > 0) setBulk('');
    if (skipped.length > 0) {
      alert(
        `${parsed.length}명 추가 · ${skipped.length}건 건너뜀\n` +
          skipped
            .slice(0, 5)
            .map((s) => `${s.reason}: ${s.line}`)
            .join('\n'),
      );
    }
  };

  const remove = (em: string) => {
    setRecipients(recipients.filter((r) => r.email !== em));
  };

  return (
    <div className="col gap-3">
      {/* 단건 입력 */}
      <div
        style={{
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>한 명씩 추가</div>
        <div className="row gap-2">
          <input
            type="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOne()}
            className="input"
            style={{ flex: 2 }}
          />
          <input
            type="text"
            placeholder="이름 (선택)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addOne()}
            className="input"
            style={{ flex: 1 }}
          />
          <button className="btn btn-secondary" onClick={addOne}>
            추가
          </button>
        </div>
      </div>

      {/* 벌크 입력 */}
      <div
        style={{
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
          여러 명 일괄 추가 (CSV 붙여넣기)
        </div>
        <div className="t-caption" style={{ marginBottom: 10 }}>
          한 줄에 한 명씩. 형식: <code>email,name</code> 또는 <code>email</code>만 · 쉼표/탭/세미콜론 구분
        </div>
        <textarea
          rows={6}
          placeholder={'hong@example.com,홍길동\nkim@example.com,김철수\npark@example.com'}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          className="textarea"
          style={{
            width: '100%',
            fontFamily: 'monospace',
            fontSize: 12,
            resize: 'vertical',
            padding: '8px 12px',
          }}
        />
        <div style={{ textAlign: 'right', marginTop: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={parseBulk} disabled={!bulk.trim()}>
            파싱하여 추가
          </button>
        </div>
      </div>

      {/* 목록 */}
      {recipients.length > 0 && (
        <div
          style={{
            padding: 16,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-card)',
            background: 'var(--color-surface)',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
            수신자 {recipients.length}명
          </div>
          <div
            style={{
              maxHeight: 320,
              overflowY: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
            }}
          >
            <table className="gs-table" style={{ border: 'none' }}>
              <thead>
                <tr>
                  <th>이메일</th>
                  <th>이름</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.email}>
                    <td>{r.email}</td>
                    <td className="t-caption">{r.name || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => remove(r.email)}
                        title="제거"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: review + dispatch ────────────────────────────
interface ReviewStepProps {
  template: TemplateItem;
  recipients: Recipient[];
  campaignName: string;
  setCampaignName: (v: string) => void;
  campaignMessage: string;
  setCampaignMessage: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
}

function ReviewStep({
  template,
  recipients,
  campaignName,
  setCampaignName,
  campaignMessage,
  setCampaignMessage,
  expiresAt,
  setExpiresAt,
}: ReviewStepProps) {
  return (
    <div className="col gap-3">
      <div
        style={{
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>캠페인 정보</div>
        <div className="col gap-2">
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 4,
                display: 'block',
              }}
            >
              캠페인 이름 *
            </label>
            <input
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="예: 2026 Q2 개인정보제공동의서"
              className="input"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 4,
                display: 'block',
              }}
            >
              이메일 메시지 (선택)
            </label>
            <textarea
              rows={3}
              value={campaignMessage}
              onChange={(e) => setCampaignMessage(e.target.value)}
              placeholder="서명 안내 메시지"
              className="textarea"
              style={{ width: '100%', resize: 'vertical', padding: '8px 12px' }}
            />
          </div>
          <div>
            <label
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginBottom: 4,
                display: 'block',
              }}
            >
              만료일 (선택)
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="input"
              style={{ width: 200 }}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          padding: 16,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface)',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>요약</div>
        <div className="col gap-1" style={{ fontSize: 13 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-caption">템플릿</span>
            <span>{template.name}</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-caption">페이지</span>
            <span>{template.page_count}p</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-caption">필드</span>
            <span>{template.field_count ?? template.fields?.length ?? 0}개</span>
          </div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-caption">수신자</span>
            <span>{recipients.length}명</span>
          </div>
        </div>
      </div>

      <div
        style={{
          padding: '12px 14px',
          background: 'var(--color-primary-subtle)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-card)',
          fontSize: 12.5,
          color: 'var(--color-primary)',
          lineHeight: 1.6,
        }}
      >
        <strong>발송 시 일어나는 일:</strong> 수신자 {recipients.length}명 각자에게 개별 서명 문서가
        생성되고, 초대 이메일이 발송됩니다. 이후 "캠페인 대시보드"에서 응답을 집계하고 서명된 PDF를
        일괄 다운로드할 수 있습니다.
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────
export default function CampaignNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const preselectedId = useQueryParam('template');

  const [step, setStep] = useState<StepValue>(preselectedId ? 2 : 1);
  const [template, setTemplate] = useState<TemplateItem | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [dispatching, setDispatching] = useState(false);

  // preselected 템플릿 로드
  useEffect(() => {
    if (!preselectedId) return;
    (async () => {
      try {
        const { data } = await api.get<TemplateItem>(API_ENDPOINTS.templates.get(preselectedId));
        setTemplate(data);
        if (!campaignName) setCampaignName(data.name);
      } catch {
        alert('템플릿을 불러올 수 없습니다');
        navigate('/templates');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedId]);

  const handleTemplateSelect = (t: TemplateItem) => {
    setTemplate(t);
    if (!campaignName) setCampaignName(t.name);
    setStep(2);
  };

  const handleDispatch = async () => {
    if (!template) return;
    if (!campaignName.trim()) {
      alert('캠페인 이름을 입력하세요');
      return;
    }
    if (recipients.length === 0) {
      alert('수신자가 없습니다');
      return;
    }
    if (!confirm(`${recipients.length}명에게 발송합니다. 계속하시겠습니까?`)) return;

    setDispatching(true);
    try {
      // 1. 캠페인 생성 — 공용 Zod 스키마로 클라이언트 선검증 후 서버 재검증.
      const createParsed = CreateCampaignBody.safeParse({
        template_id: String(template.id),
        name: campaignName.trim(),
        message: campaignMessage.trim() || null,
        expires_at: expiresAt || null,
      });
      if (!createParsed.success) {
        const first = createParsed.error.issues[0];
        alert(first?.message ?? '입력값이 올바르지 않습니다');
        setDispatching(false);
        return;
      }
      const { data: created } = await api.post<CreatedCampaign>(
        API_ENDPOINTS.campaigns.create,
        createParsed.data,
      );

      // 2. 수신자 일괄 추가 — 서버와 동일 스키마로 클라이언트 사전 검증.
      const recipientsParsed = AddRecipientsBody.safeParse({
        recipients: recipients.map((r) => ({
          email: r.email,
          name: r.name ?? undefined,
        })),
      });
      if (!recipientsParsed.success) {
        const first = recipientsParsed.error.issues[0];
        alert(first?.message ?? '수신자 목록이 올바르지 않습니다');
        setDispatching(false);
        return;
      }
      await api.post(
        API_ENDPOINTS.campaigns.recipients(created.id),
        recipientsParsed.data,
      );

      // 3. 발송
      const { data: result } = await api.post<DispatchResult>(
        API_ENDPOINTS.campaigns.dispatch(created.id),
      );

      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      alert(
        `발송 완료: 성공 ${result.success}건, 실패 ${result.failed}건 (전체 ${result.total}건)`,
      );
      navigate(`/campaigns/${created.id}`);
    } catch (err) {
      alert(errorMessage(err, '캠페인 생성/발송 실패'));
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="gs-page">
      <PageHeader title="새 캠페인" subtitle="템플릿 → 수신자 → 발송">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/campaigns')}>
          취소
        </button>
      </PageHeader>

      <Stepper current={step} />

      {step === 1 && <TemplateStep onSelect={handleTemplateSelect} />}

      {step === 2 && (
        <>
          <div style={{ marginBottom: 12, fontSize: 13 }}>
            템플릿: <strong>{template?.name}</strong>{' '}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setStep(1)}
              style={{ marginLeft: 8 }}
            >
              변경
            </button>
          </div>
          <RecipientsStep recipients={recipients} setRecipients={setRecipients} />
        </>
      )}

      {step === 3 && template && (
        <ReviewStep
          template={template}
          recipients={recipients}
          campaignName={campaignName}
          setCampaignName={setCampaignName}
          campaignMessage={campaignMessage}
          setCampaignMessage={setCampaignMessage}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
        />
      )}

      {/* Footer nav */}
      <div
        style={{
          marginTop: 24,
          paddingTop: 16,
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <button
          className="btn btn-ghost"
          onClick={() => setStep((s) => (Math.max(1, s - 1) as StepValue))}
          disabled={step === 1 || dispatching}
        >
          ← 이전
        </button>

        {step === 2 && (
          <button
            className="btn btn-primary"
            disabled={recipients.length === 0 || !template}
            onClick={() => setStep(3)}
          >
            다음 → ({recipients.length}명)
          </button>
        )}

        {step === 3 && (
          <button
            className="btn btn-primary"
            onClick={handleDispatch}
            disabled={dispatching || !campaignName.trim() || recipients.length === 0}
          >
            {dispatching ? '발송 중…' : `${recipients.length}명에게 발송`}
          </button>
        )}
      </div>
    </div>
  );
}
