/**
 * `@hono/zod-validator` 래퍼.
 *
 * 프로젝트의 에러 응답 계약은 `{ error: string }` + 4xx 상태코드다.
 * 기본 `zValidator` 는 `{ success: false, error: ZodError }` 형태로 응답하므로
 * 여기서 첫 번째 issue 의 메시지만 뽑아 기존 포맷으로 맞춰준다.
 *
 * 서버 핸들러는 `c.req.valid('json' | 'query' | 'form')` 로 파싱된 값을 꺼내
 * `any` 캐스팅 없이 타입 안전하게 사용할 수 있다.
 */
import { zValidator as zv } from '@hono/zod-validator';
import type { ZodTypeAny } from 'zod';

type Target = 'json' | 'query' | 'form' | 'header' | 'cookie' | 'param';

export const validate = <T extends ZodTypeAny>(target: Target, schema: T) =>
  zv(target as any, schema, (result, c) => {
    if (!result.success) {
      const first = result.error.issues[0];
      const message = first?.message || '잘못된 요청입니다';
      return c.json({ error: message }, 400);
    }
  });
