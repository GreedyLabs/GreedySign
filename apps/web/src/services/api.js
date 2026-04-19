import axios from 'axios';

const TOKEN_KEY = 'token';

const api = axios.create({ baseURL: '/api' });

// 요청 인터셉터 — Authorization 헤더 주입
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 응답 인터셉터 — 401 발생 시 토큰 제거 + 로그아웃 이벤트 발행
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY)) {
      // 현재 경로를 복귀 URL로 저장 (로그인 후 돌아오기 위함)
      const current = window.location.pathname;
      if (current !== '/' && !current.startsWith('/invite/')) {
        sessionStorage.setItem('auth_redirect', current);
      }
      localStorage.removeItem(TOKEN_KEY);
      // authStore가 감지할 수 있도록 커스텀 이벤트 발행
      window.dispatchEvent(new Event('auth:expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
