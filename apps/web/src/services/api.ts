/**
 * 프론트 API 클라이언트 (F-5) — axios → fetch 전환.
 *
 * 설계 원칙
 * ---------
 * - 호출부 API 형상 유지: `api.get(path)` / `api.post(path, body, opts)` 등
 *   기존 axios 인터페이스를 그대로 모방해 모든 호출부를 무수정 유지.
 * - 반환 shape 유지: `{ data }` 객체. 호출부가 `const { data } = await ...`
 *   패턴을 쓰므로 axios 의 AxiosResponse shape 중 `data` 만 제공.
 * - 에러 shape 유지: `err.response.status` / `err.response.data` /
 *   `err.response.data.error`. 컴포넌트들이 이 경로를 그대로 읽는다.
 * - Bearer 토큰 자동 주입 + 401 시 토큰 삭제 & `auth:expired` 이벤트 발행
 *   (authStore 가 구독). 이전 axios 인터셉터와 동일 동작.
 *
 * Hono RPC 와의 관계
 * ------------------
 * 이 모듈은 Hono 의 RPC 클라이언트(`hc<AppType>`) 와 호환되는 fetch 계층이다.
 * `apps/api/src/hono/app.ts` 가 `AppType` 을 export 하므로 제네릭으로 응답
 * 타입을 넘기면 호출부가 받아쓸 수 있다.
 */

const TOKEN_KEY = 'token';
const BASE = '/api';

export interface ApiErrorBody {
  error?: string;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  data: T;
}

export interface RequestOptions {
  headers?: HeadersInit;
  responseType?: 'blob' | 'json';
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

// axios 호환 에러 — `err.response.{status,data}` 경로를 그대로 노출.
export class ApiError extends Error {
  response: { status: number; data: unknown };

  constructor(status: number, data: unknown, message?: string) {
    const derived =
      message ||
      (typeof data === 'object' &&
        data !== null &&
        (data as ApiErrorBody).error) ||
      `HTTP ${status}`;
    super(typeof derived === 'string' ? derived : `HTTP ${status}`);
    this.name = 'ApiError';
    this.response = { status, data };
  }
}

async function parseErrorBody(
  res: Response,
  isBlob: boolean,
): Promise<unknown> {
  // blob 응답의 실패는 서버가 JSON 에러를 Blob 으로 돌려줄 수 있어 텍스트
  // 디코딩 후 JSON 파싱을 시도한다 (CompletePage 다운로드 실패 패턴).
  try {
    if (isBlob) {
      const blob = await res.blob();
      const text = await blob.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    const ct = res.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) return await res.json();
    return await res.text();
  } catch {
    return null;
  }
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(opts.headers || {});
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    // multipart boundary 는 브라우저가 세팅한다. 호출부에서 명시적으로
    // `multipart/form-data` 를 넘겨도 여기서 제거해 boundary 누락을 방지.
    headers.delete('Content-Type');
    payload = body;
  } else if (body !== undefined && body !== null) {
    if (!headers.has('Content-Type'))
      headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const res = await fetch(BASE + path, { method, headers, body: payload });

  // 401 처리: 토큰이 살아 있는데 서버가 401 이면 로그아웃 이벤트 발행.
  // authStore 가 `auth:expired` 를 감지해 user/token 을 비우고, 다음 내비게이션
  // 에서 `beforeLoad(requireAuth)` 가 `/login?redirect=...` 로 리다이렉트한다.
  if (res.status === 401 && getToken()) {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event('auth:expired'));
  }

  const isBlob = opts.responseType === 'blob';
  if (!res.ok) {
    const data = await parseErrorBody(res, isBlob);
    throw new ApiError(res.status, data);
  }

  if (isBlob) return { data: (await res.blob()) as unknown as T };
  // 204 No Content · 본문 없는 응답.
  if (res.status === 204 || res.headers.get('Content-Length') === '0') {
    return { data: null as T };
  }
  const ct = res.headers.get('Content-Type') || '';
  const data = ct.includes('application/json')
    ? await res.json()
    : await res.text();
  return { data: data as T };
}

const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>('GET', path, undefined, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('POST', path, body, opts),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PUT', path, body, opts),
  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>('PATCH', path, body, opts),
  delete: <T = unknown>(path: string, opts?: RequestOptions) =>
    request<T>('DELETE', path, undefined, opts),
};

export default api;
