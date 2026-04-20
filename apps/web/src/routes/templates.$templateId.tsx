import { createFileRoute } from '@tanstack/react-router';
import { requireAuth } from '../router/guards';
import TemplateEditorPage from '../pages/TemplateEditorPage';
import { prefetch, templateQuery } from '../router/loaders';

// 템플릿 에디터 — 풀스크린. AppShell 없음.
export const Route = createFileRoute('/templates/$templateId')({
  beforeLoad: requireAuth,
  loader: ({ context, params }) =>
    prefetch(templateQuery, params.templateId)({ context }),
  component: TemplateEditorPage,
});
