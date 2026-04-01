import { create } from 'zustand';
import api from '../services/api';

const TOKEN_KEY = 'token';

export const useAuthStore = create((set) => ({
  user: null,
  token: localStorage.getItem(TOKEN_KEY),
  loading: true,

  init: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) { set({ loading: false }); return; }
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data, token, loading: false });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, token: null, loading: false });
    }
  },

  loginWithGoogle: async (credential) => {
    const { data } = await api.post('/auth/google', { credential });
    localStorage.setItem(TOKEN_KEY, data.token);
    set({ user: data.user, token: data.token });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null, token: null });
  },
}));
