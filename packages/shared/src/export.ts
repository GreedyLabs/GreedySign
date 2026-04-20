/**
 * /api/documents/:docId/export 관련 입력 스키마.
 */
import { z } from 'zod';

// POST /api/documents/:docId/export — 완료 문서 PDF 패키징.
// mode='combined' 는 한 PDF 에 모두, 'individual' 은 서명자별 분할.
export const ExportDocumentBody = z.object({
  mode: z.enum(['combined', 'individual']).optional(),
});
export type ExportDocumentBody = z.infer<typeof ExportDocumentBody>;
