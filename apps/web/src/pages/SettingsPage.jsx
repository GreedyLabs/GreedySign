/**
 * SettingsPage — profile + appearance tabs.
 * Route: /settings/:tab  (tab = 'profile' | 'appearance')
 */
import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import { useNavigate, useParams, NavLink } from '../lib/router';
import PageHeader from '../components/ui/PageHeader';
import Avatar from '../components/ui/Avatar';

// ─── Profile Tab ─────────────────────────────────────────
function ProfileTab() {
  const { user, init } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    if (!name.trim() || name === user?.name) return;
    setSaving(true);
    try {
      await api.put('/auth/profile', { name });
      await init(); // authStore의 user 갱신 (이름 + 아바타)
      setMsg('저장되었습니다.');
      setTimeout(() => setMsg(''), 2500);
    } catch (err) {
      setMsg(err.response?.data?.error ?? '저장 실패');
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
          <Avatar name={user?.name} src={user?.avatar_url} size="lg" />
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
            style={{ color: msg.includes('실패') ? 'var(--color-danger)' : 'var(--color-success)' }}
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
function AppearanceTab() {
  const read = (key, def) => document.documentElement.dataset[key] || def;
  const write = (key, val) => {
    document.documentElement.dataset[key] = val;
    localStorage.setItem(`gs-${key}`, val);
  };

  const [theme, setTheme] = useState(() => read('theme', 'light'));
  const [density, setDensity] = useState(() => read('density', 'normal'));
  const [corner, setCorner] = useState(() => read('corner', 'default'));

  const apply = (setter, key, val) => {
    setter(val);
    write(key, val);
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
          {[
            { v: 'light', label: '☀️ 라이트' },
            { v: 'dark', label: '🌙 다크' },
          ].map(({ v, label }) => (
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
                background: theme === v ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
                color: theme === v ? 'var(--color-primary)' : 'var(--color-text)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {label}
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
          {[
            { v: 'normal', label: '기본', desc: '넓은 여백, 편안한 읽기' },
            { v: 'compact', label: '컴팩트', desc: '더 많은 내용을 한 화면에' },
          ].map(({ v, label, desc }) => (
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
          {[
            { v: 'default', label: '기본', radius: 'var(--radius-card)' },
            { v: 'rounded', label: '둥글게', radius: 20 },
            { v: 'sharp', label: '각지게', radius: 0 },
          ].map(({ v, label, radius }) => (
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
                background: corner === v ? 'var(--color-primary-subtle)' : 'var(--color-bg-subtle)',
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

// ─── SettingsPage ─────────────────────────────────────────
const TABS = [
  { id: 'profile', label: '프로필' },
  { id: 'appearance', label: '화면 설정' },
];

export default function SettingsPage() {
  const { tab = 'profile' } = useParams();

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
          {tab === 'appearance' && <AppearanceTab />}
        </div>
      </div>
    </div>
  );
}
