/**
 * InstantiateTemplateDialog — 템플릿으로 1:1 문서 만들기 + 즉시 발송.
 * 성공 시 `/docs/:createdId` 로 이동한다. 같은 서식을 수신자 한 명에게 반복
 * 발송할 때 사용하는 경로로, 캠페인을 만들지 않는다.
 */
import { useState, useEffect, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { InstantiateTemplateBody } from '@greedylabs/greedysign-shared';
import api from '../../services/api';
import { ApiError } from '../../services/api';
import { API_ENDPOINTS } from '../../services/endpoints';
import { useNavigate } from '../../lib/router';
import Modal from '../ui/Modal';
import InfoBanner from '../ui/InfoBanner';

export interface TemplateSummary {
  id: number | string;
  name: string;
}

interface InstantiateResponse {
  id: number | string;
}

interface InstantiateTemplateDialogProps {
  template: TemplateSummary | null;
  open: boolean;
  onClose?: () => void;
}

export default function InstantiateTemplateDialog({
  template,
  open,
  onClose,
}: InstantiateTemplateDialogProps) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [docName, setDocName] = useState('');
  const [error, setError] = useState('');

  // open 될 때마다 폼 초기화
  useEffect(() => {
    if (open) {
      setEmail('');
      setName('');
      setDocName('');
      setError('');
    }
  }, [open]);

  const mut = useMutation<InstantiateResponse, Error>({
    mutationFn: async () => {
      if (!template) throw new Error('template missing');
      // 서버와 공용 Zod 스키마로 클라이언트 선검증 후 전송.
      const parsed = InstantiateTemplateBody.safeParse({
        email: email.trim(),
        name: name.trim() || undefined,
        document_name: docName.trim() || undefined,
      });
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(first?.message ?? '입력값이 올바르지 않습니다');
      }
      const { data } = await api.post<InstantiateResponse>(
        API_ENDPOINTS.templates.instantiate(template.id),
        parsed.data,
      );
      return data;
    },
    onSuccess: (data) => {
      onClose?.();
      navigate(`/docs/${data.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        const payload = err.response.data as { error?: string } | undefined;
        setError(payload?.error ?? '발송 실패');
      } else {
        setError(err.message || '발송 실패');
      }
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) {
      setError('수신자 이메일을 입력하세요');
      return;
    }
    mut.mutate();
  };

  if (!template) return null;

  return (
    <Modal
      open={open}
      onClose={mut.isPending ? undefined : onClose}
      title="1:1 발송 — 템플릿으로 문서 만들기"
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={mut.isPending}
          >
            취소
          </button>
          <button
            type="submit"
            form="instantiate-form"
            className="btn btn-primary btn-sm"
            disabled={mut.isPending}
          >
            {mut.isPending ? '발송 중…' : '발송하기'}
          </button>
        </>
      }
    >
      <InfoBanner variant="info" marginBottom={16}>
        템플릿 <strong>{template.name}</strong> 으로 단일 수신자에게 서명 요청을 바로
        보냅니다. 캠페인은 만들어지지 않으며, 이 문서는 일반 문서 목록에 표시됩니다.
      </InfoBanner>

      <form id="instantiate-form" onSubmit={handleSubmit}>
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="instantiate-email"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}
          >
            수신자 이메일 <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <input
            id="instantiate-email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="signer@example.com"
            required
            autoFocus
            disabled={mut.isPending}
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="instantiate-name"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}
          >
            수신자 이름{' '}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
              (선택)
            </span>
          </label>
          <input
            id="instantiate-name"
            type="text"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
            disabled={mut.isPending}
          />
        </div>

        <div>
          <label
            htmlFor="instantiate-docname"
            style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}
          >
            문서 이름{' '}
            <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
              (선택)
            </span>
          </label>
          <input
            id="instantiate-docname"
            type="text"
            className="input"
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder={`${template.name} — 수신자 이메일`}
            disabled={mut.isPending}
          />
          <div
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            비워두면 <code>{`${template.name} — ${email || '수신자 이메일'}`}</code>{' '}
            형식으로 자동 생성됩니다.
          </div>
        </div>

        {error && (
          <InfoBanner variant="danger" marginBottom={0} style={{ marginTop: 14 }}>
            {error}
          </InfoBanner>
        )}
      </form>
    </Modal>
  );
}
