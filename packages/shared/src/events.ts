/**
 * /api/events 관련 입력 스키마.
 * SSE 는 EventSource 가 커스텀 헤더를 실을 수 없어 JWT 를 query(token) 로
 * 전달한다. 아래 스키마는 /user, /documents/:docId 모두 동일하게 재사용된다.
 */
import { z } from 'zod';

export const EventsQuery = z.object({
  token: z.string().min(1, 'token 이 필요합니다'),
});
export type EventsQuery = z.infer<typeof EventsQuery>;
