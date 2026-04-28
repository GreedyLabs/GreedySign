/**
 * SettingsPage — profile + appearance + signatures tabs.
 * Route: /settings/:tab  (tab = 'profile' | 'appearance' | 'signatures')
 */
import { useState, type CSSProperties } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/authStore';
import api, { ApiError } from '../services/api';
import { API_ENDPOINTS as endpoints } from '../services/endpoints';
import { useParams, NavLink } from '../lib/router';
import PageHeader from '../components/ui/PageHeader';
import Avatar from '../components/ui/Avatar';
import SignatureModal, { type SignatureRecord } from '../components/SignatureModal';
import { MoonIcon, SunIcon, type IconProps } from '../components/ui/Icon';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.response.data as { error?: string } | undefined;
    return body?.error ?? err.message ?? fallback;
  }
  return fallback;
}

// ─── Profile Tab ─────────────────────────────────────────
function ProfileTab() {
  const user = useAuthStore((s) => s.user);
  const init = useAuthStore((s) => s.init);
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const avatarUrl = (user as { avatar_url?: string } | null)?.avatar_url;

  const save = async () => {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    try {
      await api.put('/auth/profile', { name });
      await init(); // authStore의 user 갱신 (이름 + 아바타)
      setMsg('저장되었습니다.');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg(errorMessage(err, '저장 실패'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="col gap-6">
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          프로필
        </h2>
        <p className="t-caption">계정 정보를 확인하고 이름을 수정할 수 있습니다.</p>
      </div>

      {/* Identity card */}
      <div className="gs-panel">
        <div className="gs-panel-body row gap-4" style={{ alignItems: 'center' }}>
          <Avatar name={user?.name} src={avatarUrl} size="lg" />
          <div className="col" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{user?.name}</div>
            <div className="t-caption">{user?.email}</div>
            <div className="t-caption" style={{ marginTop: 3 }}>
              Google 계정으로 연결됨
            </div>
          </div>
        </div>
      </div>

      {/* Name edit */}
      <div>
        <label className="label">표시 이름</label>
        <div className="row gap-2">
          <input
            className="input flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="표시 이름"
          />
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !name.trim() || name === user?.name}
          >
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
        {msg && (
          <div
            className="help"
            style={{
              color: msg.includes('실패') ? 'var(--color-danger)' : 'var(--color-success)',
            }}
          >
            {msg}
          </div>
        )}
        <div className="help">이름은 서명 초대 및 활동 로그에 표시됩니다.</div>
      </div>
    </div>
  );
}

// ─── Appearance Tab ───────────────────────────────────────
type ThemeValue = 'light' | 'dark';
type DensityValue = 'normal' | 'compact';
type CornerValue = 'default' | 'rounded' | 'sharp';

type DatasetKey = 'theme' | 'density' | 'corner';

function AppearanceTab() {
  const read = (key: DatasetKey, def: string): string =>
    document.documentElement.dataset[key] || def;
  const write = (key: DatasetKey, val: string) => {
    document.documentElement.dataset[key] = val;
    localStorage.setItem(`gs-${key}`, val);
  };

  const [theme, setTheme] = useState<ThemeValue>(() => read('theme', 'light') as ThemeValue);
  const [density, setDensity] = useState<DensityValue>(
    () => read('density', 'normal') as DensityValue,
  );
  const [corner, setCorner] = useState<CornerValue>(
    () => read('corner', 'default') as CornerValue,
  );

  function apply<T extends string>(
    setter: (v: T) => void,
    key: DatasetKey,
    val: T,
  ) {
    setter(val);
    write(key, val);
  }

  const themeOptions: {
    v: ThemeValue;
    label: string;
    Icon: (props: IconProps) => React.ReactElement;
  }[] = [
    { v: 'light', label: '라이트', Icon: SunIcon },
    { v: 'dark', label: '다크', Icon: MoonIcon },
  ];
  const densityOptions: { v: DensityValue; label: string; desc: string }[] = [
    { v: 'normal', label: '기본', desc: '넓은 여백, 편안한 읽기' },
    { v: 'compact', label: '컴팩트', desc: '더 많은 내용을 한 화면에' },
  ];
  const cornerOptions: { v: CornerValue; label: string; radius: CSSProperties['borderRadius'] }[] =
    [
      { v: 'default', label: '기본', radius: 'var(--radius-card)' },
      { v: 'rounded', label: '둥글게', radius: 20 },
      { v: 'sharp', label: '각지게', radius: 0 },
    ];

  return (
    <div className="col gap-6">
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          화면 설정
        </h2>
        <p className="t-caption">테마, 밀도, 모서리 스타일을 조정합니다.</p>
      </div>

      {/* Theme */}
      <div className="gs-panel">
        <div className="gs-panel-head">
          <span className="gs-panel-title">테마</span>
        </div>
        <div className="gs-panel-body row gap-3">
          {themeOptions.map(({ v, label, Icon }) => (
            <button
              key={v}
              onClick={() => apply(setTheme, 'theme', v)}
              style={{
                flex: 1,
                padding: '14px 0',
                borderRadius: 'var(--radius-card)',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: 13,
                border: `2px solid ${theme === v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background:
                  theme === v ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                color: theme === v ? 'var(--color-primary)' : 'var(--color-text)',
                transition: 'all var(--dur-fast) var(--ease-out)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="gs-panel">
        <div className="gs-panel-head">
          <span className="gs-panel-title">밀도</span>
        </div>
        <div className="gs-panel-body col gap-2">
          {densityOptions.map(({ v, label, desc }) => (
            <button
              key={v}
              onClick={() => apply(setDensity, 'density', v)}
              style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-card)',
                textAlign: 'left',
                cursor: 'pointer',
                border: `2px solid ${density === v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: density === v ? 'var(--color-primary-subtle)' : 'transparent',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              <div
                style={{
                  fontWeight: 500,
                  fontSize: 13,
                  color: density === v ? 'var(--color-primary)' : 'var(--color-text)',
                }}
              >
                {label}
              </div>
              <div className="t-caption">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Corner */}
      <div className="gs-panel">
        <div className="gs-panel-head">
          <span className="gs-panel-title">모서리 스타일</span>
        </div>
        <div className="gs-panel-body row gap-3">
          {cornerOptions.map(({ v, label, radius }) => (
            <button
              key={v}
              onClick={() => apply(setCorner, 'corner', v)}
              style={{
                flex: 1,
                padding: '14px 0',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                borderRadius: radius,
                border: `2px solid ${corner === v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background:
                  corner === v ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                color: corner === v ? 'var(--color-primary)' : 'var(--color-text)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Signatures Tab ───────────────────────────────────────
function SignaturesTab() {
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState<
    { mode: 'create' } | { mode: 'edit'; sig: SignatureRecord } | null
  >(null);
  const [busyId, setBusyId] = useState<string | number | null>(null);

  const { data: signatures = [], isLoading } = useQuery<SignatureRecord[]>({
    queryKey: ['signatures'],
    queryFn: async () => (await api.get<SignatureRecord[]>(endpoints.signatures.list)).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['signatures'] });

  const handleDelete = async (sig: SignatureRecord) => {
    if (!confirm(`"${sig.name}" 서명을 삭제하시겠습니까?`)) return;
    setBusyId(sig.id);
    try {
      await api.delete(endpoints.signatures.delete(sig.id));
      refresh();
    } catch (err) {
      alert(errorMessage(err, '삭제 실패'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSetDefault = async (sig: SignatureRecord) => {
    if (sig.is_default) return;
    setBusyId(sig.id);
    try {
      await api.patch(endpoints.signatures.setDefault(sig.id));
      refresh();
    } catch (err) {
      alert(errorMessage(err, '기본 설정 실패'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="col gap-6">
      <div className="row" style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 4,
            }}
          >
            내 서명
          </h2>
          <p className="t-caption">
            저장된 서명을 관리합니다. 기본 서명은 새 문서에서 자동 선택됩니다.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalState({ mode: 'create' })}>
          <svg
            width={13}
            height={13}
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <path d="M8 2v12M2 8h12" />
          </svg>
          새 서명
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="gs-spinner" />
        </div>
      ) : signatures.length === 0 ? (
        <div
          className="gs-panel"
          style={{
            padding: 40,
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}
        >
          <div style={{ fontSize: 14, marginBottom: 12 }}>
            저장된 서명이 없습니다.
          </div>
          <div className="t-caption" style={{ marginBottom: 16 }}>
            서명을 미리 저장해 두면 문서에서 한 번에 적용할 수 있습니다.
          </div>
          <button className="btn btn-secondary" onClick={() => setModalState({ mode: 'create' })}>
            첫 서명 만들기
          </button>
        </div>
      ) : (
        <div className="col gap-2">
          {signatures.map((sig) => (
            <div
              key={sig.id}
              className="gs-panel"
              style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {/* Thumbnail with checkered transparent BG */}
              <div
                style={{
                  width: 120,
                  height: 48,
                  flexShrink: 0,
                  background:
                    'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 14px 14px',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={
                    sig.thumbnail ||
                    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sig.svg_data || '')}`
                  }
                  alt={sig.name}
                  style={{ maxHeight: 42, maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>

              {/* Meta */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className="row gap-2"
                  style={{ alignItems: 'center', marginBottom: 2 }}
                >
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{sig.name}</span>
                  {sig.is_default && (
                    <span
                      style={{
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        borderRadius: 'var(--radius-full)',
                        background: 'var(--color-primary-subtle)',
                        color: 'var(--color-primary)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      기본
                    </span>
                  )}
                </div>
                <div className="t-caption">
                  {sig.method === 'image' ? '이미지 업로드' : '직접 그림'}
                </div>
              </div>

              {/* Actions */}
              <div className="row gap-1" style={{ flexShrink: 0 }}>
                {!sig.is_default && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => handleSetDefault(sig)}
                    disabled={busyId === sig.id}
                    title="기본 서명으로 설정"
                  >
                    기본 설정
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setModalState({ mode: 'edit', sig })}
                  title="수정"
                >
                  수정
                </button>
                <button
                  className="icon-btn"
                  onClick={() => handleDelete(sig)}
                  disabled={busyId === sig.id}
                  title="삭제"
                  style={{ color: 'var(--color-danger)' }}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  >
                    <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalState && (
        <SignatureModal
          editing={modalState.mode === 'edit' ? modalState.sig : null}
          onClose={() => setModalState(null)}
          onSaved={() => {
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── SettingsPage ─────────────────────────────────────────
const TABS: { id: 'profile' | 'appearance' | 'signatures'; label: string }[] = [
  { id: 'profile', label: '프로필' },
  { id: 'signatures', label: '내 서명' },
  { id: 'appearance', label: '화면 설정' },
];

export default function SettingsPage() {
  const params = useParams<{ tab?: string }>();
  const tab = params.tab ?? 'profile';

  return (
    <div className="gs-page">
      <PageHeader title="설정" subtitle="계정 및 화면 설정을 관리합니다." />

      <div className="gs-settings-grid">
        {/* Settings nav */}
        <div className="gs-settings-nav">
          {TABS.map((t) => (
            <NavLink key={t.id} to={`/settings/${t.id}`} exact className="gs-nav-item">
              {t.label}
            </NavLink>
          ))}
        </div>

        {/* Content */}
        <div>
          {tab === 'profile' && <ProfileTab />}
          {tab === 'signatures' && <SignaturesTab />}
          {tab === 'appearance' && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}
