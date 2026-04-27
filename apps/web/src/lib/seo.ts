/**
 * SEO 상수 + 라우트 `head()` 빌더.
 *
 * TanStack Router 1.168+ 의 빌트인 head API 를 활용한다. 외부 라이브러리 없이
 * 라우트 단위로 title/meta/links/JSON-LD 를 선언하면 `<HeadContent />` 가
 * React 19 metadata hoisting 으로 자동으로 `document.head` 에 주입한다.
 * JSON-LD 는 `"script:ld+json"` 특수 키로 라우터가 <script type="application/ld+json">
 * 을 직접 생성 (React 19 가 script 는 hoist 하지 않지만 Google 크롤러는 본문
 * 위치의 JSON-LD 도 정상 파싱하므로 문제 없음).
 *
 * 도메인 변경 시 SITE_URL 한 줄만 수정하면 robots/canonical/sitemap 모두 반영.
 * 환경변수화하지 않은 이유는 빌드 타임 고정값이고 값 변경 빈도가 극히 낮기 때문.
 *
 * Public (index,follow) 라우트는 `/` 와 `/guide` 두 개만. 나머지는 __root 의
 * 기본 `noindex, nofollow` 가 상속돼 검색엔진에서 제외된다 (opt-in 화이트리스트).
 */

// ─ 사이트 상수 ────────────────────────────────────────────────
export const SITE_URL = 'https://sign.greedylabs.kr';
export const SITE_NAME = 'GreedySign';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/og.png`;
export const DEFAULT_LOCALE = 'ko_KR';

/**
 * TanStack Router 의 head API 는 React 19 의 native HTML meta props 를
 * 기대하지만, `script:ld+json` 같은 특수 키도 문자열 그대로 내보내는 관용이
 * 있다. 둘을 동시에 품기 위해 구조를 느슨하게 열어둔다.
 */
export type MetaEntry = Record<string, unknown>;
export type LinkEntry = Record<string, unknown>;

export interface BuildMetaArgs {
  title: string;
  description: string;
  path?: string;
  image?: string;
  type?: string;
  noIndex?: boolean;
}

// ─ 공용 빌더 ──────────────────────────────────────────────────
/**
 * 표준 SEO meta 배열을 만든다. 라우트의 `head()` 에서 `...buildMeta(...)` 로
 * 스프레드해 다른 meta(JSON-LD 등)와 섞어 쓸 수 있다.
 */
export function buildMeta({
  title,
  description,
  path = '/',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  noIndex = false,
}: BuildMetaArgs): MetaEntry[] {
  const url = `${SITE_URL}${path}`;
  return [
    { title },
    { name: 'description', content: description },
    { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
    // Open Graph — 카카오/페이스북/슬랙 링크 프리뷰
    { property: 'og:type', content: type },
    { property: 'og:site_name', content: SITE_NAME },
    { property: 'og:locale', content: DEFAULT_LOCALE },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: url },
    { property: 'og:image', content: image },
    // Twitter Cards
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: image },
  ];
}

/** 라우트 `head()` 의 `links` 필드에 넣을 canonical 링크. */
export function canonicalLink(path: string = '/'): LinkEntry[] {
  return [{ rel: 'canonical', href: `${SITE_URL}${path}` }];
}

/** JSON-LD 스키마를 meta 배열 항목으로 감싼다. */
export function jsonLd(schema: unknown): MetaEntry {
  return { 'script:ld+json': schema };
}

// ─ 공통 schema.org 스냅샷 ─────────────────────────────────────
export const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/favicon.svg`,
};

export const websiteSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  inLanguage: 'ko',
};

export const softwareApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: SITE_NAME,
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description: '엔터프라이즈 PDF 전자서명 · 대량 배포 플랫폼',
  url: SITE_URL,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
};
