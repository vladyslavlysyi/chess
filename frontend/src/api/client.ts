import axios from 'axios';
import type { TokenResponse, User, GameSummary } from '../types';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({ baseURL: BASE_URL });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = localStorage.getItem('refresh_token');
      if (refresh) {
        try {
          const { data } = await axios.post<TokenResponse>(`${BASE_URL}/auth/refresh`, {
            refresh_token: refresh,
          });
          localStorage.setItem('access_token', data.access_token);
          localStorage.setItem('refresh_token', data.refresh_token);
          original.headers.Authorization = `Bearer ${data.access_token}`;
          return api(original);
        } catch {
          localStorage.clear();
          window.location.reload();
        }
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  register: (username: string, email: string, password: string) =>
    api.post<TokenResponse>('/auth/register', { username, email, password }),
  login: (username: string, password: string) =>
    api.post<TokenResponse>('/auth/login', { username, password }),
  me: () => api.get<User>('/auth/me'),
  profile: (username: string) => api.get<User>(`/auth/users/${username}`),
};

export const gamesApi = {
  history: (limit = 20, offset = 0) =>
    api.get<{ games: GameSummary[]; total: number }>('/games/history', {
      params: { limit, offset },
    }),
  detail: (gameId: string) => api.get(`/games/${gameId}`),
};

export default api;
