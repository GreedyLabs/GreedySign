/**
 * /api/auth 관련 입력 스키마.
 */
import { z } from 'zod';

// POST /api/auth/google — Google 로그인 토큰 교환.
export const GoogleLoginBody = z.object({
  credential: z.string().min(1, 'credential 이 필요합니다'),
});
export type GoogleLoginBody = z.infer<typeof GoogleLoginBody>;

// PUT /api/auth/profile — 사용자 프로필 업데이트.
export const UpdateProfileBody = z.object({
  name: z.string().trim().min(1, '이름을 입력해주세요').max(100),
});
export type UpdateProfileBody = z.infer<typeof UpdateProfileBody>;

// GET /api/auth/users/search — 같은 도메인 사용자 검색 (query).
export const UsersSearchQuery = z.object({
  q: z.string().trim().optional(),
});
export type UsersSearchQuery = z.infer<typeof UsersSearchQuery>;
