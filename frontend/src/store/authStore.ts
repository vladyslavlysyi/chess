import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authApi } from '../api/client';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isLoading: false,
      error: null,
      isAuthenticated: false,

      login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authApi.login(username, password);
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          const me = await authApi.me();
          set({ user: me.data, isAuthenticated: true, isLoading: false });
        } catch (e: any) {
          set({
            error: e.response?.data?.detail || 'Login failed',
            isLoading: false,
          });
          throw e;
        }
      },

      register: async (username, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const { data } = await authApi.register(username, email, password);
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          const me = await authApi.me();
          set({ user: me.data, isAuthenticated: true, isLoading: false });
        } catch (e: any) {
          set({
            error: e.response?.data?.detail || 'Registration failed',
            isLoading: false,
          });
          throw e;
        }
      },

      logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        const token = localStorage.getItem('access_token');
        if (!token) return;
        try {
          const { data } = await authApi.me();
          set({ user: data, isAuthenticated: true });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },

      clearError: () => set({ error: null }),
    }),
    { name: 'auth-store', partialize: (s) => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
  )
);
