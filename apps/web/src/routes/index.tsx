import { createFileRoute } from '@tanstack/react-router';
import { LandingRoute, redirectIfAuthed } from '../router/guards';
import {
  buildMeta,
  canonicalLink,
  jsonLd,
  organizationSchema,
  websiteSchema,
  softwareApplicationSchema,
} from '../lib/seo';

const TITLE = 'GreedySign — 엔터프라이즈 PDF 전자서명 · 대량 배포';
const DESCRIPTION =
  '팀·계약·캠페인 단위로 PDF 전자서명을 발송하고 감사 로그까지 관리하는 엔터프라이즈 e-sign 플랫폼. 템플릿, 대량 발송, 감사 로그, 무결성 검증을 한 곳에서.';

// 랜딩 `/` — 로그인 상태면 /docs 로 리다이렉트, 아니면 AboutPage.
export const Route = createFileRoute('/')({
  beforeLoad: redirectIfAuthed,
  head: () => ({
    meta: [
      ...buildMeta({ title: TITLE, description: DESCRIPTION, path: '/' }),
      jsonLd(softwareApplicationSchema),
      jsonLd(organizationSchema),
      jsonLd(websiteSchema),
    ],
    links: canonicalLink('/'),
  }),
  component: LandingRoute,
});
