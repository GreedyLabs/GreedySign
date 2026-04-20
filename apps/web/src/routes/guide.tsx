import { createFileRoute } from '@tanstack/react-router';
import PublicShell from '../components/PublicShell';
import UserGuidePage from '../pages/UserGuidePage';
import {
  buildMeta,
  canonicalLink,
  jsonLd,
  SITE_URL,
  SITE_NAME,
} from '../lib/seo';

const TITLE = '사용자 가이드 — GreedySign';
const DESCRIPTION =
  'GreedySign 기능 가이드. 문서 업로드·서명·템플릿·캠페인·내보내기 등 주요 기능 사용법을 단계별로 안내합니다.';

// 가이드 페이지는 TechArticle 로 표기해 Google 이 "기술 문서" 컨텍스트로 인식.
const guideArticleSchema = {
  '@context': 'https://schema.org',
  '@type': 'TechArticle',
  headline: '사용자 가이드',
  name: TITLE,
  description: DESCRIPTION,
  url: `${SITE_URL}/guide`,
  inLanguage: 'ko',
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
  },
};

export const Route = createFileRoute('/guide')({
  head: () => ({
    meta: [
      ...buildMeta({
        title: TITLE,
        description: DESCRIPTION,
        path: '/guide',
        type: 'article',
      }),
      jsonLd(guideArticleSchema),
    ],
    links: canonicalLink('/guide'),
  }),
  component: () => (
    <PublicShell>
      <UserGuidePage />
    </PublicShell>
  ),
});
