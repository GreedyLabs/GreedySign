/**
 * Shared formatting helpers.
 * Kept framework-agnostic — return plain strings so they can be used inside
 * React nodes or elsewhere (exports, CSV bundles, etc.).
 *
 * 시간 관련 전제:
 *  - 서버는 모든 시각을 UTC (ISO-8601 `...Z`) 로 직렬화한다.
 *  - 아래 헬퍼들은 `new Date(iso)` 로 파싱한 뒤 브라우저 로컬 TZ 로 렌더한다.
 *  - 감사/인증서 용도는 TZ 축약명을 함께 보여줘서 혼동을 방지한다
 *    (예: "2026. 4. 20. 오후 3:45:30 KST"). `formatDateTimeLong` 참고.
 */

export type DateInput = string | number | Date | null | undefined;

/**
 * YYYY.MM.DD format (로컬 TZ 기준). Returns em-dash for nullish / invalid input.
 */
export function formatDate(iso: DateInput): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Human-friendly relative time (방금 전 / N분 전 / N시간 전 / 어제 / locale date).
 * Falls back to locale date for anything older than 2 days.
 */
export function formatRelativeDate(iso: DateInput): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 172800) return '어제';
  return d.toLocaleDateString('ko-KR');
}

/**
 * YYYY.MM.DD HH:MM format (로컬 TZ). 리스트/테이블용 compact 표기.
 * TZ 축약명이 필요하면 `formatDateTimeLong` 사용.
 */
export function formatDateTime(iso: DateInput): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const date = formatDate(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm}`;
}

/**
 * 풀 날짜+시각+TZ 축약명 (예: "2026. 4. 20. 오후 3:45:30 KST").
 * 감사 타임라인·인증서·참여자 상세 등 "정확히 언제" 가 중요한 곳에서 사용.
 */
export function formatDateTimeLong(iso: DateInput): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * 사용자 브라우저의 현재 TZ 정보 (예: {iana:'Asia/Seoul', short:'KST', offset:'UTC+9'}).
 * 인증서 푸터 등에 "시각은 귀하의 로컬 TZ 기준입니다" 표시용.
 */
export interface TimeZoneLabel {
  iana: string;
  short: string;
  offset: string;
}
export function getTimeZoneLabel(at: DateInput = new Date()): TimeZoneLabel {
  const d = at instanceof Date ? at : new Date(at ?? Date.now());
  const iana = Intl.DateTimeFormat().resolvedOptions().timeZone;
  // GMT 오프셋 (분 단위 getTimezoneOffset 은 반대 부호).
  const tzMin = -d.getTimezoneOffset();
  const sign = tzMin >= 0 ? '+' : '-';
  const abs = Math.abs(tzMin);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  const offset = mm === 0 ? `UTC${sign}${hh}` : `UTC${sign}${hh}:${String(mm).padStart(2, '0')}`;
  // toLocaleTimeString 로 TZ 축약명 추출 (예: "... KST").
  const short =
    new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' })
      .formatToParts(d)
      .find((p) => p.type === 'timeZoneName')?.value ?? iana;
  return { iana, short, offset };
}

/**
 * Bytes → KB / MB string. Matches the existing DocTable output.
 */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)}KB`
    : `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
