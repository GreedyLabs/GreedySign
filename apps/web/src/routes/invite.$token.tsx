import { createFileRoute } from '@tanstack/react-router';
import InvitePage from '../components/InvitePage';

// 초대 토큰 경로는 로그인 여부와 무관 — InvitePage 내부가 인증 상태에 따라
// 미리보기 → 로그인 유도 → 문서 리다이렉트 흐름을 자체 처리한다.
export const Route = createFileRoute('/invite/$token')({
  component: InvitePage,
});
