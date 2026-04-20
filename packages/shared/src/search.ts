/**
 * /api/search 관련 입력 스키마.
 */
import { z } from 'zod';

// GET /api/search — 사용자 검색 (query).
// 빈 문자열을 허용 (서버 핸들러가 '' → 빈 결과로 처리).
export const SearchQuery = z.object({
  q: z.string().trim().optional(),
});
export type SearchQuery = z.infer<typeof SearchQuery>;
