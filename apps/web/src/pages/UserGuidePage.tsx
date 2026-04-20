/**
 * UserGuidePage — 공개 사용자 가이드 (`/guide`).
 * 좌측 TOC + 본문 2-컬럼. 섹션 id 는 URL hash 공유 가능 (`/guide#campaigns`).
 * PublicShell 안에서 렌더되므로 상단 브랜드 네비는 PublicShell 이 담당한다.
 */
import { useEffect, useState, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { Link, useLocation, useNavigate } from '../lib/router';

// ─── Types ────────────────────────────────────────────────
interface GuideItem {
  id: string;
  title: string;
  path?: string;
}
interface GuideGroup {
  group: string;
  items: GuideItem[];
}
interface FlatGuideItem extends GuideItem {
  group: string;
}

// ─── 섹션 정의 ─────────────────────────────────────────────────────
// 좌측 TOC는 group 단위로 묶이고, 본문은 GuideSection 단일 스트림으로
// 렌더된다. path 가 있으면 본문 헤더 옆에 mono 경로 뱃지가 붙는다.
const GUIDE_SECTIONS: GuideGroup[] = [
  {
    group: '시작하기',
    items: [
      { id: 'welcome', title: 'GreedySign 소개' },
      { id: 'quickstart', title: '5분 퀵스타트' },
      { id: 'account', title: '로그인 · 계정' },
    ],
  },
  {
    group: '워크스페이스',
    items: [
      { id: 'docs', title: '내 문서', path: '/docs' },
      { id: 'shared', title: '공유받은 문서', path: '/shared' },
      { id: 'upload', title: '새 문서 요청', path: '/upload' },
      { id: 'editor', title: '에디터' },
      { id: 'complete', title: '완료 인증서' },
      { id: 'activity', title: '활동 로그', path: '/activity' },
      { id: 'notifications', title: '알림', path: '/notifications' },
      { id: 'settings', title: '설정', path: '/settings/profile' },
      { id: 'search', title: '통합 검색 (⌘K)' },
    ],
  },
  {
    group: '대량 배포',
    items: [
      { id: 'templates', title: '템플릿', path: '/templates' },
      { id: 'campaigns', title: '캠페인', path: '/campaigns' },
      { id: 'campaigns-new', title: '새 캠페인 마법사', path: '/campaigns/new' },
      { id: 'campaign-dashboard', title: '캠페인 대시보드' },
      { id: 'recipient-lifecycle', title: '수신자 라이프사이클' },
    ],
  },
  {
    group: '참여자 & 감사',
    items: [
      { id: 'participant', title: '참여자 관점' },
      { id: 'realtime-audit', title: '실시간 알림 · 감사' },
    ],
  },
  {
    group: '도움',
    items: [{ id: 'faq', title: '자주 묻는 질문' }],
  },
];

// flat 리스트(좌측 TOC 스크롤 스파이용)
const FLAT_SECTIONS: FlatGuideItem[] = GUIDE_SECTIONS.flatMap((g) =>
  g.items.map((it) => ({ ...it, group: g.group })),
);

// ─── 가이드 전용 스타일 ────────────────────────────────────────────
const CSS = `
  .gs-guide-root {
    background: var(--color-bg);
    color: var(--color-text);
    min-height: 100%;
  }

  /* Guide hero band */
  .gs-guide-band {
    border-bottom: 1px solid var(--color-border-subtle);
    background: var(--color-bg-subtle);
    padding: 48px 32px 40px;
  }
  .gs-guide-band-inner {
    max-width: 1240px; margin: 0 auto;
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 32px; flex-wrap: wrap;
  }
  .gs-guide-eyebrow {
    color: var(--color-primary);
    font-size: 12px; letter-spacing: 0.14em;
    text-transform: uppercase; font-weight: 700;
    margin-bottom: 10px;
  }
  .gs-guide-title {
    font-family: var(--font-display);
    font-size: 40px; font-weight: 500;
    letter-spacing: -0.025em; line-height: 1.08;
    margin: 0 0 10px;
    word-break: keep-all;
  }
  .gs-guide-lead {
    font-size: 16px; line-height: 1.65;
    color: var(--color-text-secondary);
    margin: 0; max-width: 64ch;
    word-break: keep-all;
  }

  /* 2-col layout (TOC + body) */
  .gs-guide-grid {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 64px;
    max-width: 1040px; margin: 0 auto;
    padding: 40px 32px 96px;
  }

  /* Left TOC */
  .gs-guide-toc {
    position: sticky; top: 80px;
    align-self: start;
    max-height: calc(100vh - 96px);
    overflow-y: auto;
    padding-right: 12px;
  }
  .gs-guide-toc-group { margin-bottom: 24px; }
  .gs-guide-toc-title {
    font-size: 11px; letter-spacing: 0.14em;
    text-transform: uppercase; font-weight: 700;
    color: var(--color-text-muted);
    margin: 0 0 10px; padding: 0 10px;
  }
  .gs-guide-toc-link {
    display: block;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-control);
    border-left: 2px solid transparent;
    line-height: 1.45;
    cursor: pointer;
    text-decoration: none;
  }
  .gs-guide-toc-link:hover { color: var(--color-text); background: var(--color-bg-muted); }
  .gs-guide-toc-link.is-active {
    color: var(--color-primary);
    border-left-color: var(--color-primary);
    background: var(--color-primary-subtle);
    font-weight: 500;
  }

  /* Main body */
  .gs-guide-body { min-width: 0; }
  .gs-guide-section { scroll-margin-top: 80px; margin-bottom: 56px; }
  .gs-guide-section h2 {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 0 0 8px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--color-border-subtle);
    display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  }
  .gs-guide-section-anchor {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
    text-decoration: none;
    font-family: var(--font-mono);
  }
  .gs-guide-section-anchor:hover { color: var(--color-primary); }
  .gs-guide-path-badge {
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 2px 8px;
    border: 1px solid var(--color-primary-border);
    color: var(--color-primary);
    background: var(--color-primary-subtle);
    border-radius: var(--radius-control);
    text-decoration: none;
    letter-spacing: 0.01em;
  }
  .gs-guide-path-badge:hover { background: var(--color-primary); color: #fff; }

  .gs-guide-section h3 {
    font-family: var(--font-display);
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 28px 0 8px;
  }
  .gs-guide-section p {
    font-size: 15px;
    line-height: 1.75;
    color: var(--color-text-secondary);
    margin: 0 0 16px;
    max-width: 68ch;
    word-break: keep-all;
  }
  .gs-guide-section p strong,
  .gs-guide-section li strong {
    color: var(--color-text);
    font-weight: 600;
  }
  .gs-guide-section ul, .gs-guide-section ol {
    margin: 0 0 18px;
    padding-left: 20px;
    display: flex; flex-direction: column; gap: 8px;
    max-width: 68ch;
  }
  .gs-guide-section li {
    font-size: 14.5px; line-height: 1.65;
    color: var(--color-text-secondary);
    word-break: keep-all;
  }
  .gs-guide-section code, .gs-guide-section kbd {
    font-family: var(--font-mono);
    font-size: 12.5px;
    padding: 1px 6px;
    background: var(--color-bg-muted);
    border: 1px solid var(--color-border-subtle);
    border-radius: 4px;
    color: var(--color-text);
  }

  .gs-guide-callout {
    padding: 14px 18px;
    background: var(--color-primary-subtle);
    border-left: 3px solid var(--color-primary);
    border-radius: 0 var(--radius-card) var(--radius-card) 0;
    margin: 16px 0 24px;
    max-width: 68ch;
  }
  .gs-guide-callout-title {
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 600;
    color: var(--color-primary);
    margin: 0 0 4px;
    letter-spacing: 0.01em;
  }
  .gs-guide-callout p {
    margin: 0; color: var(--color-text);
    font-size: 14px; line-height: 1.65;
  }

  .gs-guide-kv {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 12px 24px;
    padding: 20px;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    border-radius: var(--radius-card);
    margin: 0 0 24px;
    max-width: 68ch;
    font-size: 14px;
  }
  .gs-guide-kv dt {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    padding-top: 2px;
  }
  .gs-guide-kv dd {
    margin: 0; color: var(--color-text-secondary);
    line-height: 1.55;
  }

  /* 문서 하단 "맨 위로" 링크 — 유일한 페이지 내 네비 보조 장치 */
  .gs-guide-top {
    display: inline-flex; align-items: center; gap: 6px;
    margin-top: 40px;
    padding: 8px 14px;
    border: 1px solid var(--color-border);
    background: var(--color-bg);
    border-radius: var(--radius-control);
    font-size: 13px;
    color: var(--color-text-secondary);
    text-decoration: none;
    cursor: pointer;
    transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  }
  .gs-guide-top:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  /* Responsive */
  @media (max-width: 1100px) {
    .gs-guide-grid { grid-template-columns: 240px minmax(0, 1fr); gap: 40px; }
  }
  @media (max-width: 760px) {
    .gs-guide-band { padding: 32px 20px 28px; }
    .gs-guide-title { font-size: 30px; }
    .gs-guide-grid {
      grid-template-columns: 1fr;
      padding: 24px 20px 64px;
      gap: 24px;
    }
    .gs-guide-toc {
      position: static;
      max-height: none;
      padding-right: 0;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--color-border-subtle);
    }
  }
`;

// ─── UI helpers ────────────────────────────────────────────────────
function InlineCode({ children }: { children: ReactNode }) {
  return <code>{children}</code>;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 20,
        padding: '0 6px',
        marginInline: 1,
        borderRadius: 4,
        border: '1px solid var(--color-border)',
        borderBottomWidth: 2,
        background: 'var(--color-surface)',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
      }}
    >
      {children}
    </span>
  );
}

function PathBadge({ to }: { to: string }) {
  return (
    <Link to={to} className="gs-guide-path-badge" aria-label={`${to} 경로로 이동`}>
      {to}
    </Link>
  );
}

interface GuideSectionProps {
  id: string;
  title: string;
  path?: string;
  children: ReactNode;
}
function GuideSection({ id, title, path, children }: GuideSectionProps) {
  return (
    <section id={id} className="gs-guide-section">
      <h2>
        <span>{title}</span>
        {path && <PathBadge to={path} />}
        <a href={`#${id}`} className="gs-guide-section-anchor" aria-label={`#${id} 링크 복사`}>
          #
        </a>
      </h2>
      {children}
    </section>
  );
}

interface CalloutProps {
  title?: ReactNode;
  children: ReactNode;
}
function Callout({ title, children }: CalloutProps) {
  return (
    <div className="gs-guide-callout">
      {title && <div className="gs-guide-callout-title">{title}</div>}
      <p>{children}</p>
    </div>
  );
}


// ─── 메인 ──────────────────────────────────────────────────────────
export default function UserGuidePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState(
    location.hash ? location.hash.slice(1) : FLAT_SECTIONS[0].id,
  );

  // 해시 변경 → 스크롤
  //   - hash 가 있고 매칭 섹션이 있으면 그 섹션으로 부드럽게 이동.
  //   - hash 가 없거나 매칭 섹션이 없으면 PublicShell 의 .gs-content 컨테이너와
  //     window 모두 최상단으로 리셋. (랜딩 → 가이드 전환 시 이전 스크롤 위치가
  //     남아서 본문 중간부터 보이는 버그 방지)
  useEffect(() => {
    const hash = location.hash?.slice(1);
    const scrollable = document.querySelector('.gs-content');
    if (hash) {
      const el = document.getElementById(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveId(hash);
        return;
      }
      // 알 수 없는 hash → 최상단 fallback
    }
    if (scrollable) scrollable.scrollTop = 0;
    window.scrollTo(0, 0);
    setActiveId(FLAT_SECTIONS[0].id);
  }, [location.hash, location.pathname]);

  // 스크롤 스파이
  useEffect(() => {
    const ids = FLAT_SECTIONS.map((s) => s.id);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort(
            (a, b) =>
              a.target.getBoundingClientRect().top -
              b.target.getBoundingClientRect().top,
          );
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0.01 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const handlePick = (e: ReactMouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    navigate(`/guide#${id}`, { replace: false });
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(id);
  };

  return (
    <div className="gs-guide-root">
      <style>{CSS}</style>

      {/* ── Header band ──
         "5분 퀵스타트" / "랜딩 페이지" 상단 버튼은 제거했다. 상단 공개 네비
         (PublicShell) 에 로고 클릭 = 랜딩 이동이 이미 존재하고, 5분 퀵스타트는
         좌측 TOC 에서 한 번의 클릭으로 접근 가능하기 때문이다. 본문 lead 안의
         "5분 퀵스타트" 인라인 링크는 유지. */}
      <div className="gs-guide-band">
        <div className="gs-guide-band-inner">
          <div>
            <div className="gs-guide-eyebrow">사용자 가이드</div>
            <h1 className="gs-guide-title">GreedySign을 단계별로 배우기</h1>
            <p className="gs-guide-lead">
              사이드바 메뉴 순서대로, 각 화면에서 할 수 있는 일과 작동 방식, 그리고 함께
              알아두면 좋은 개념을 정리했습니다. 처음 사용한다면{' '}
              <a href="#quickstart" style={{ color: 'var(--color-primary)' }}>
                5분 퀵스타트
              </a>
              부터 읽어 보세요.
            </p>
          </div>
        </div>
      </div>

      {/* ── Body grid ── */}
      <div className="gs-guide-grid">
        {/* Left TOC */}
        <nav className="gs-guide-toc" aria-label="가이드 목차">
          {GUIDE_SECTIONS.map((g) => (
            <div className="gs-guide-toc-group" key={g.group}>
              <div className="gs-guide-toc-title">{g.group}</div>
              {g.items.map((it) => (
                <a
                  key={it.id}
                  href={`#${it.id}`}
                  className={
                    'gs-guide-toc-link' + (activeId === it.id ? ' is-active' : '')
                  }
                  onClick={(e) => handlePick(e, it.id)}
                >
                  {it.title}
                </a>
              ))}
            </div>
          ))}
        </nav>

        {/* Main body */}
        <div className="gs-guide-body">
          {/* ── 시작하기 ── */}
          <GuideSection id="welcome" title="GreedySign 소개">
            <p>
              GreedySign은 기업 내부 동의·서약·계약에 특화된 오픈소스 PDF 전자서명 도구입니다.
              1:1 계약과 임직원 전원을 대상으로 하는 대량 배포 캠페인을 같은 에디터·같은 감사
              로그로 처리할 수 있고, SSE 실시간 집계·SHA-256 해시·완료 인증서까지 기본으로
              제공합니다.
            </p>
            <p>이 가이드는 세 가지 관점에서 읽을 수 있습니다:</p>
            <ul>
              <li>
                <strong>처음 쓰는 분</strong> — <a href="#quickstart">5분 퀵스타트</a>만 읽고
                바로 시작
              </li>
              <li>
                <strong>소유자 · 관리자</strong> — 워크스페이스 → 대량 배포 순서로 정독
              </li>
              <li>
                <strong>참여자(서명자)</strong> —{' '}
                <a href="#participant">참여자 관점</a> 섹션으로 바로 이동
              </li>
            </ul>
          </GuideSection>

          <GuideSection id="quickstart" title="5분 퀵스타트">
            <p>첫 문서를 발송하기까지의 최단 경로입니다:</p>
            <ol>
              <li>
                <strong>로그인</strong> — Google 계정으로 <InlineCode>/login</InlineCode>{' '}
                에서 로그인하면 자동으로 계정이 생성됩니다.
              </li>
              <li>
                <strong>PDF 업로드</strong> —{' '}
                <Link to="/upload" style={{ color: 'var(--color-primary)' }}>새 문서 요청</Link>
                에서 PDF 를 올리면 에디터로 이동합니다.
              </li>
              <li>
                <strong>필드 배치</strong> — 텍스트 · 서명 · 날짜 · 체크박스 4 가지 필드를
                드래그로 배치합니다.
              </li>
              <li>
                <strong>참여자 추가</strong> — 우측 사이드바 "참여자" 탭에서 서명자·참조자의
                이메일과 이름을 입력합니다.
              </li>
              <li>
                <strong>발송</strong> — 하단 우측 발송 버튼으로 일괄 초대 메일 발송. 상태는{' '}
                <InlineCode>draft</InlineCode> → <InlineCode>in_progress</InlineCode>{' '}
                로 전환됩니다.
              </li>
            </ol>
            <Callout title="같은 서식을 계속 반복해서 써야 한다면?">
              근로계약서 · 개인정보 동의서처럼 고정된 PDF 를 계속 다시 보내야 한다면,{' '}
              <a href="#templates">템플릿</a> 으로 저장해 두세요. 이후에는 템플릿 목록에서
              <strong> "1:1 발송"</strong> 버튼으로 한 명에게 즉시, 또는{' '}
              <a href="#campaigns">캠페인</a> 으로 수십~수백 명에게 한 번에 배포할 수 있습니다.
            </Callout>
          </GuideSection>

          <GuideSection id="account" title="로그인 · 계정">
            <p>
              GreedySign 은 별도 회원가입 없이 <strong>Google OAuth 2.0</strong> 로 인증합니다.
              비밀번호는 서버에 저장되지 않고, 세션은 JWT 로 관리됩니다.
            </p>
            <ul>
              <li>
                <strong>로그인 페이지</strong> — <InlineCode>/login</InlineCode>. 이미
                로그인된 사용자는 자동으로 <InlineCode>/docs</InlineCode> 또는 복귀 경로로
                이동합니다.
              </li>
              <li>
                <strong>초대 메일 수신자</strong> — 메일 링크({' '}
                <InlineCode>/invite/:token</InlineCode>)로 접근 시 비로그인이면 Google 로그인
                화면으로 안내되고, 로그인 후 자동으로 해당 문서의 참여자로 매칭됩니다.
              </li>
              <li>
                <strong>공개 페이지</strong> — 루트(<InlineCode>/</InlineCode>) 랜딩과{' '}
                <InlineCode>/guide</InlineCode> 는 로그인 없이도 볼 수 있습니다.
              </li>
            </ul>
          </GuideSection>

          {/* ── 워크스페이스 ── */}
          <GuideSection id="docs" title="내 문서" path="/docs">
            <p>
              내가 소유자(Owner)인 문서 목록. 사이드바 배지에 소유 문서 수가 표시됩니다.
              기본 정렬은 최근 수정순이고 상단 필터로 상태(<InlineCode>draft</InlineCode> /{' '}
              <InlineCode>in_progress</InlineCode> / <InlineCode>completed</InlineCode> /{' '}
              <InlineCode>voided</InlineCode>) 를 좁힐 수 있습니다.
            </p>
            <p>행 우측의 미니 액션 메뉴:</p>
            <ul>
              <li>
                <strong>보기 / 편집</strong> — 에디터로 이동.{' '}
                <InlineCode>draft</InlineCode> 에서만 필드·참여자 편집 가능
              </li>
              <li>
                <strong>무효화(Void)</strong> — 진행 중 문서 강제 종료. 참여자 토큰 무효 +
                SSE 로 "voided" 알림 전파
              </li>
              <li>
                <strong>삭제</strong> — <InlineCode>draft</InlineCode> 에서만 가능. 이외에는
                무효화 후 보관 상태로 남습니다.
              </li>
            </ul>
            <Callout title="캠페인 문서는 여기에 보이지 않습니다">
              캠페인에서 생성된 문서는 수량이 많아 내 문서 목록이 비대해지지 않도록 숨겨지고,{' '}
              <Link to="/campaigns" style={{ color: 'var(--color-primary)' }}>
                캠페인 대시보드
              </Link>
              에서만 관리됩니다.
            </Callout>
          </GuideSection>

          <GuideSection id="shared" title="공유받은 문서" path="/shared">
            <p>
              내가 서명자 또는 참조자로 초대된 문서 목록. 미수락 초대가 있으면 사이드바 배지가{' '}
              <strong>경고 색</strong>으로 바뀌어 즉시 식별됩니다.
            </p>
            <ul>
              <li>
                <strong>수락</strong> — 에디터에서 내 필드만 채우고 서명
              </li>
              <li>
                <strong>거절</strong> — 사유와 함께 기록, 소유자에게 즉시 알림
              </li>
              <li>
                <strong>완료된 문서</strong> — 완료 인증서 페이지(
                <InlineCode>/docs/:docId/complete</InlineCode>)에서 완료 PDF · 감사 로그 확인
              </li>
            </ul>
          </GuideSection>

          <GuideSection id="upload" title="새 문서 요청" path="/upload">
            <p>
              PDF 를 업로드해 새 문서 또는 템플릿을 만듭니다. 업로드 즉시 SHA-256 해시가
              기록되고, UUID 경로로 저장된 뒤 에디터로 자동 이동합니다.
            </p>
            <p>업로드한 PDF 의 두 가지 용도:</p>
            <ul>
              <li>
                <strong>일반 서명 문서</strong> — 즉시{' '}
                <InlineCode>documents</InlineCode> 레코드로 생성해 개별 참여자·필드 지정 후
                발송
              </li>
              <li>
                <strong>템플릿 전환</strong> — 에디터에서 "템플릿으로 저장"을 눌러{' '}
                <InlineCode>document_templates</InlineCode> 로 승격. 이후{' '}
                <Link to="/campaigns" className="gs-guide-path-badge">
                  /campaigns
                </Link>{' '}
                에서 수신자를 붙여 일괄 발송
              </li>
            </ul>
            <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
              최대 업로드 크기는 nginx · API (Hono) 레벨에서 50MB 입니다.
            </p>
          </GuideSection>

          <GuideSection id="editor" title="에디터">
            <p>
              문서 상세 화면(<InlineCode>/docs/:docId</InlineCode>). 풀스크린으로 렌더되고
              사이드바·헤더 없이 에디터에만 집중할 수 있습니다.
            </p>
            <h3>좌측 — PDF 뷰어 · 필드 레이어</h3>
            <p>
              툴바의 <strong>텍스트 · 서명 · 날짜 · 체크박스</strong> 네 가지 필드 타입을
              선택한 뒤 PDF 위를 드래그해 배치합니다. 필드는 우측 패널에서 좌표·크기·페이지·담당자
              (assignee)를 조정할 수 있습니다.
            </p>
            <h3>우측 — 에디터 사이드바</h3>
            <ul>
              <li>
                <strong>참여자</strong> — signer/cc 추가·제거, 순차·동시 서명 모드, 개별 초대
                링크 재발송
              </li>
              <li>
                <strong>필드</strong> — 페이지별 개수 요약, 속성(필수·선택, placeholder)
              </li>
              <li>
                <strong>상태</strong> — 발송 버튼, 현재 상태(
                <InlineCode>draft</InlineCode> → <InlineCode>in_progress</InlineCode> →{' '}
                <InlineCode>completed</InlineCode>), 완료 인증서 링크, 무효화
              </li>
              <li>
                <strong>설정</strong> — 만료일, 참여자 메시지, 상위 캠페인 바로가기
              </li>
            </ul>
            <p>
              하단 우측 <strong>발송</strong> 버튼으로 전원에게 초대 메일 발송 +{' '}
              <InlineCode>in_progress</InlineCode> 전환. 이후 필드 편집은 읽기 전용으로
              잠깁니다.
            </p>
          </GuideSection>

          <GuideSection id="complete" title="완료 인증서">
            <p>
              문서가 <InlineCode>completed</InlineCode> 상태일 때 접근 가능한 페이지(
              <InlineCode>/docs/:docId/complete</InlineCode>). 포함 내용:
            </p>
            <dl className="gs-guide-kv">
              <dt>Hashes</dt>
              <dd>원본 SHA-256 · 확정 SHA-256 이중 기록</dd>
              <dt>Completed at</dt>
              <dd>전원 서명 완료 시각(서버 UTC 기준)</dd>
              <dt>Signers</dt>
              <dd>참여자별 서명 시각, 접속 IP, User-Agent</dd>
              <dt>Download</dt>
              <dd>완료 PDF (pdf-lib 로 필드 평탄화)</dd>
            </dl>
          </GuideSection>

          <GuideSection id="activity" title="활동 로그" path="/activity">
            <p>
              내가 소유한 모든 문서·캠페인의 <InlineCode>audit_log</InlineCode> 를 시간
              역순으로 보여줍니다. 업로드, 발송, 열람, 서명, 거절, 무효화, 캠페인 완료 등 모든
              액션이 기록됩니다. 상단 바에서 액션 타입·기간·대상 문서로 필터링할 수 있습니다.
            </p>
          </GuideSection>

          <GuideSection id="notifications" title="알림" path="/notifications">
            <p>
              헤더 종 아이콘(배지 = 미읽 수)으로 빠르게 열 수 있고, 전체 목록은 이 페이지에서
              확인합니다. SSE 로 실시간 전파됩니다.
            </p>
            <ul>
              <li>서명 요청 도착 · 서명 완료 · 서명 거절</li>
              <li>캠페인 완료 (자동 · 수동)</li>
              <li>수신자 제외 · 교체 이벤트</li>
              <li>문서 무효화</li>
            </ul>
            <p>개별 "읽음" 또는 "모두 읽음" 일괄 처리.</p>
          </GuideSection>

          <GuideSection id="settings" title="설정" path="/settings/profile">
            <p>현재 제공되는 탭:</p>
            <ul>
              <li>
                <strong>프로필</strong>(<InlineCode>/settings/profile</InlineCode>) — 표시
                이름, 기본 서명 라이브러리(<InlineCode>user_signatures</InlineCode>) 관리
              </li>
              <li>
                <strong>화면 설정</strong>(<InlineCode>/settings/appearance</InlineCode>) —
                다크/라이트 테마, 언어 등 UI 선호
              </li>
            </ul>
            <p>변경은 저장 즉시 로컬에 반영되며 SSE 알림은 발생하지 않습니다.</p>
          </GuideSection>

          <GuideSection id="search" title="통합 검색 (⌘K)">
            <p>
              어느 화면에서든 <Kbd>⌘</Kbd> <Kbd>K</Kbd> 또는 <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> 로
              검색 팔레트가 열립니다. 내 문서 제목, 공유받은 문서, 참여자 이메일, 최근 활동을
              한 입력창에서 훑어보고 결과 클릭으로 점프합니다.
            </p>
          </GuideSection>

          {/* ── 대량 배포 · 반복 발송 ── */}
          <GuideSection id="templates" title="템플릿" path="/templates">
            <p>
              <strong>한 번 만든 PDF 서식을 계속 재사용하기 위한 목록입니다.</strong>{' '}
              근로계약서, 개인정보 동의서, 임대차 계약서처럼 한 번 만들어 두고 사람만 바뀌어
              가며 반복해서 사용하는 문서를 여기 둡니다. 상단 "새 템플릿"으로 PDF 를 올리면{' '}
              <InlineCode>/templates/:id</InlineCode> 에디터에서 필드를 배치할 수 있습니다.
            </p>
            <p>
              템플릿 에디터는 일반 문서 에디터와 동일한 편집 경험을 제공하지만{' '}
              <strong>참여자 대신 필드만</strong> 정의합니다. 수신자는 발송 시점에 붙습니다.
              "배포 준비 완료" 로 상태를 변경하면 읽기 전용으로 잠기고, 두 가지 발송 경로가
              열립니다.
            </p>
            <h3>템플릿 활용 두 가지 — 1:1 발송 vs 캠페인</h3>
            <p>"배포 준비 완료" 상태의 템플릿 행에는 두 개의 액션 버튼이 있습니다:</p>
            <ul>
              <li>
                <strong>1:1 발송</strong> — 한 명에게만 즉시 보내고 싶을 때. 수신자 이메일·이름
                만 입력하면 새 문서가 생성되고 초대 메일이 바로 발송됩니다. 캠페인은 만들어지지
                않으며, 만들어진 문서는 일반{' '}
                <Link to="/docs" style={{ color: 'var(--color-primary)' }}>내 문서</Link>{' '}
                목록에 함께 표시됩니다. <strong>새 입사자가 생길 때마다 같은 계약서를 다시
                보내는 식의 장기간 반복 사용에 가장 적합합니다.</strong>
              </li>
              <li>
                <strong>캠페인 시작</strong> — 한 번에 N 명에게 묶어서 발송하고 진행 상황을
                대시보드로 추적하고 싶을 때. 새 캠페인 마법사로 이동합니다.
              </li>
            </ul>
            <Callout title="언제 1:1 발송을 쓰고, 언제 캠페인을 쓰나요?">
              <strong>1:1 발송</strong> 은 "같은 서식을 한 번에 한 명씩, 계속 반복" 하는 흐름,{' '}
              <strong>캠페인</strong> 은 "같은 서식을 한 번에 여러 명에게 묶어서" 보내는 흐름에
              어울립니다. 두 경로 모두 동일한 템플릿(같은 PDF · 같은 필드 배치)을 그대로
              사용합니다.
            </Callout>
          </GuideSection>

          <GuideSection id="campaigns" title="캠페인" path="/campaigns">
            <p>
              지금까지 만든 캠페인 목록. 각 행은 이름, 연결된 템플릿, 상태(
              <InlineCode>draft</InlineCode> / <InlineCode>in_progress</InlineCode> /{' '}
              <InlineCode>completed</InlineCode> / <InlineCode>cancelled</InlineCode>),
              수신자 수, 서명 완료 비율을 표시합니다. 행 클릭 시 캠페인 대시보드로 이동.
            </p>
          </GuideSection>

          <GuideSection id="campaigns-new" title="새 캠페인 마법사" path="/campaigns/new">
            <p>세 단계의 단일 페이지 마법사:</p>
            <ol>
              <li>
                <strong>템플릿 선택</strong> — "배포 준비 완료" 상태의 템플릿 중 하나 선택.{' '}
                <InlineCode>?template=&lt;id&gt;</InlineCode> 쿼리스트링으로 사전 선택 가능.
              </li>
              <li>
                <strong>수신자 입력</strong> — <InlineCode>email,이름</InlineCode> 또는{' '}
                <InlineCode>email</InlineCode> 한 줄씩. CSV 붙여넣기 지원. 중복·잘못된 형식은
                "skipped" 탭에 정리.
              </li>
              <li>
                <strong>발송 옵션</strong> — 이름, 수신자 메시지, 만료 기한. "지금 발송"은
                즉시 일괄 발송 + <InlineCode>in_progress</InlineCode>. "초안 저장"은{' '}
                <InlineCode>draft</InlineCode> 로 저장해 추후 dispatch 가능.
              </li>
            </ol>
          </GuideSection>

          <GuideSection id="campaign-dashboard" title="캠페인 대시보드">
            <p>
              캠페인의 실시간 진행 현황을 보는 핵심 화면(
              <InlineCode>/campaigns/:campaignId</InlineCode>). 수신자 SSE 로 통계·목록이 자동
              갱신되며, <InlineCode>in_progress</InlineCode> 상태에서는 10초 폴링 폴백이 함께
              동작합니다.
            </p>
            <h3>통계 · 진행바</h3>
            <p>
              상단 6 개 카드: 전체 · 발송 · 열람 · 서명 완료 · 거절 ·{' '}
              <strong>제외(excluded)</strong>. 스택 진행바는{' '}
              <InlineCode>signed + declined</InlineCode> 기반.
            </p>
            <h3>헤더 액션</h3>
            <ul>
              <li>
                <strong>CSV 내보내기</strong> — 수신자 상태 스냅샷
              </li>
              <li>
                <strong>완료 PDF 일괄 다운로드 (ZIP)</strong> — 완료 문서 PDF 묶음. 완료 건이
                하나라도 있으면 활성화
              </li>
              <li>
                <strong>수신자 추가</strong> — <InlineCode>in_progress</InlineCode> 에만
                노출. 이메일 추가 즉시 개별 문서 생성·발송
              </li>
              <li>
                <strong>수동 완료</strong> — 미응답자가 있을 때만 노출. 남은 문서를 일괄 만료
                처리하고 상태를 <InlineCode>completed</InlineCode> 로 전환. 알림 "소유자가
                캠페인을 수동 완료 처리했습니다" 가 기록됨
              </li>
              <li>
                <strong>취소</strong> — <InlineCode>draft</InlineCode>/
                <InlineCode>in_progress</InlineCode> 에서 캠페인 중단. 미응답 문서는 void
              </li>
            </ul>
          </GuideSection>

          <GuideSection id="recipient-lifecycle" title="수신자 라이프사이클">
            <p>각 수신자 행의 우측 액션은 상태에 따라 달라집니다:</p>
            <ul>
              <li>
                <strong>보기</strong> (<InlineCode>signed</InlineCode>) — 완료 문서로 이동
              </li>
              <li>
                <strong>재발송</strong> (<InlineCode>sent</InlineCode>/
                <InlineCode>viewed</InlineCode>) — 초대 메일 재전송. 30초 스로틀
              </li>
              <li>
                <strong>교체</strong> (진행 중, 미서명) — 담당자 퇴사·변경 시 사용. 기존 수신자
                상태를 <InlineCode>excluded</InlineCode> 처리하고 기존 문서는 void,
                신규 이메일로 <strong>새 문서 재생성·발송</strong>.{' '}
                <InlineCode>total_count</InlineCode> 가 1 증가합니다.
              </li>
              <li>
                <strong>제외</strong> (진행 중, 미종결) — 추적 중단. 문서 void + 상태{' '}
                <InlineCode>excluded</InlineCode>. 모든 수신자가 종결 상태가 되면 캠페인이
                자동 <InlineCode>completed</InlineCode> 로 전이됩니다.
              </li>
            </ul>
            <Callout title="종결 상태 (TERMINAL)">
              <InlineCode>signed</InlineCode> · <InlineCode>declined</InlineCode> ·{' '}
              <InlineCode>expired</InlineCode> · <InlineCode>failed</InlineCode> ·{' '}
              <InlineCode>excluded</InlineCode> 다섯 가지. 이 중 하나라도 아닌 수신자가 남아
              있으면 캠페인은 계속 진행 중입니다.
            </Callout>
          </GuideSection>

          {/* ── 참여자 & 감사 ── */}
          <GuideSection id="participant" title="참여자 관점">
            <p>소유자가 아닌 초대받은 사람의 흐름:</p>
            <ol>
              <li>
                <strong>초대 메일 수신</strong> — 링크는{' '}
                <InlineCode>/invite/:token</InlineCode>
              </li>
              <li>
                <strong>토큰 페이지 진입</strong> — 비로그인이면 Google 로그인 후 자동
                리다이렉트
              </li>
              <li>
                <strong>문서 열람</strong> — 내가 담당인 필드만 하이라이트. 열람 즉시{' '}
                <InlineCode>viewed_at</InlineCode> 기록 + 소유자에게 SSE 전파
              </li>
              <li>
                <strong>서명 제출 · 거절</strong> — 제출 시 문서 완료 + 캠페인 집계 갱신.
                거절은 사유와 함께 <InlineCode>declined</InlineCode> 로 종료
              </li>
              <li>
                <strong>완료 인증서</strong> —{' '}
                <InlineCode>/docs/:docId/complete</InlineCode> 에서 결과물과 감사 로그를
                언제든 확인
              </li>
            </ol>
          </GuideSection>

          <GuideSection id="realtime-audit" title="실시간 알림 · 감사">
            <ul>
              <li>
                <strong>SSE 두 채널</strong> — 문서별(
                <InlineCode>/events/documents/:docId</InlineCode>) + 사용자별(
                <InlineCode>/events/user</InlineCode>)
              </li>
              <li>
                <strong>audit_log</strong> — 모든 액션(초대·발송·열람·서명·거절·무효화·제외·
                교체·수동 완료 등)이 JSON 메타와 함께 적재. 활동 로그에서 조회
              </li>
              <li>
                <strong>해시</strong> — 원본 PDF SHA-256 + 확정 후 평탄화 PDF SHA-256 이중
                기록으로 변조 여부 확인
              </li>
            </ul>
          </GuideSection>

          {/* ── FAQ ── */}
          <GuideSection id="faq" title="자주 묻는 질문">
            <h3>캠페인 진행 중인데 수신자가 퇴사했습니다.</h3>
            <p>
              대시보드 해당 행에서 <strong>교체</strong> 를 누르고 후임자의 이메일을
              입력하세요. 기존 문서는 void 되고 신규 문서가 후임자에게 재발송됩니다. 제외
              카운트가 1 증가합니다.
            </p>

            <h3>일부 수신자가 응답하지 않아 캠페인을 마감하고 싶습니다.</h3>
            <p>
              대시보드 헤더의 <strong>수동 완료</strong> 로 미응답 문서를 일괄 만료 처리하고{' '}
              <InlineCode>completed</InlineCode> 로 전환하세요. 이미 서명한 문서는
              유지됩니다.
            </p>

            <h3>캠페인에 속한 문서가 /docs 에 보이지 않습니다.</h3>
            <p>
              의도된 동작입니다. 캠페인 문서는 목록이 비대해지지 않도록 숨겨지고, 캠페인
              대시보드에서만 관리됩니다.
            </p>

            <h3>이미 종료된 캠페인에 수신자를 추가할 수 있나요?</h3>
            <p>
              <InlineCode>completed</InlineCode> · <InlineCode>cancelled</InlineCode>{' '}
              상태에는 추가할 수 없습니다. 같은 템플릿으로 새 캠페인을 만들어 진행하세요.
            </p>

            <h3>완료 PDF 를 외부 저장소에 보관하고 싶습니다.</h3>
            <p>
              캠페인 대시보드의 <strong>완료 PDF 일괄 다운로드 (ZIP)</strong> 를 사용하세요.
              완료 문서의 평탄화 PDF 가 수신자 이메일을 파일명으로 묶여 다운로드됩니다.
            </p>

            <div
              style={{
                marginTop: 32,
                padding: '14px 18px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--color-bg-subtle)',
                fontSize: 14,
                color: 'var(--color-text-muted)',
                maxWidth: '68ch',
              }}
            >
              추가로 궁금한 점이 있으면{' '}
              <Link to="/activity" style={{ color: 'var(--color-primary)' }}>
                활동 로그
              </Link>{' '}
              에서 실제 기록을 확인하거나, 관리자에게 문의해 주세요.
            </div>

            {/* 문서 하단 · 맨 위로 */}
            <div>
              <a
                href="#welcome"
                className="gs-guide-top"
                onClick={(e) => handlePick(e, 'welcome')}
              >
                ↑ 맨 위로
              </a>
            </div>
          </GuideSection>
        </div>
      </div>
    </div>
  );
}
