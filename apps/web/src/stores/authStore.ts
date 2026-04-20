import { create } from 'zustand';
import api from '../services/api';

const TOKEN_KEY = 'token';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  picture?: string | null;
  domain?: string | null;
  [key: string]: unknown;
}

interface GoogleLoginResponse {
  user: AuthUser;
  token: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  init: () => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
}

/**
 * 순수 클라이언트 상태(사용자 정보 + 토큰) 만 관리. 복귀 경로는 URL 에서
 * 관리하므로 (idiomatic hardening — TanStack `beforeLoad` + `redirect`
 * search param) 여기서는 sessionStorage 를 쓰지 않는다.
 */
export const useAuthStore = create<AuthState>((set) => {
  // api.ts 인터셉터가 401 을 감지하면 이 이벤트를 발행한다. 컴포넌트 밖에서
  // 단 한 번만 구독 — 토큰 만료 시 스토어를 비워 `beforeLoad(requireAuth)`
  // 가 다음 내비게이션에서 재검사할 수 있도록 한다.
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
        const { data } = await api.get<AuthUser>('/auth/me');
        set({ user: data, token, loading: false });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        set({ user: null, token: null, loading: false });
      }
    },

    loginWithGoogle: async (credential: string) => {
      const { data } = await api.post<GoogleLoginResponse>('/auth/google', {
        credential,
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      set({ user: data.user, token: data.token });
    },

    logout: () => {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, token: null });
    },
  };
});
