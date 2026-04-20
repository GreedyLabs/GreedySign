/**
 * /api/invite 관련 입력 스키마.
 *
 * GET  /api/invite/:token          — 바디/쿼리 없음 (공개 엔드포인트).
 * POST /api/invite/:token/accept   — 바디 없음 (auth 헤더만 사용).
 *
 * 현재 검증할 입력이 없어 placeholder 로만 남긴다. 향후 초대 수락 시 별도
 * 파라미터가 추가될 경우 여기에 스키마를 추가한다.
 */
export {};
