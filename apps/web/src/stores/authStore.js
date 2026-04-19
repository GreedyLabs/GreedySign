import { create } from 'zustand';
import api from '../services/api';

const TOKEN_KEY = 'token';

export const useAuthStore = create((set) => {
  // api.js 인터셉터가 401을 감지하면 이 이벤트를 발행함
  // 스토어가 로드될 때 한 번 등록 (컴포넌트 밖에서 구독)
  if (typeof window !== 'undefined') {
    window.addEventListener('auth:expired', () => {
      set({ user: null, token: null });
    });
  }

  return {
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    loading: true,

    init: async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {
        set({ loading: false });
        return;
      }
      try {
        const { data } = await api.get('/auth/me');
        set({ user: data, token, loading: false });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        set({ user: null, token: null, loading: false });
      }
    },

    // 로그인 성공 시 sessionStorage에 저장된 복귀 경로를 반환
    loginWithGoogle: async (credential) => {
      const { data } = await api.post('/auth/google', { credential });
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ user: data.user, token: data.token });

      const redirect = sessionStorage.getItem('auth_redirect');
      if (redirect) {
        sessionStorage.removeItem('auth_redirect');
        return redirect;
      }
      return null;
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, token: null });
    },
  };
});
