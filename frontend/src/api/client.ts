import axios from 'axios';
import type { TokenResponse, User, GameSummary } from '../types';

// Use relative path by default to route through Nginx in production
const BASE_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || '/api');

const api = axios.create({ baseURL: BASE_URL });

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh: concurrent 401s share ONE refresh request so a rotated
// refresh token isn't spent by parallel calls (which would log the user out).
let refreshPromise: Promise<string> | null = null;

function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}

async function doRefresh(): Promise<string> {
  const refresh = localStorage.getItem('refresh_token');
  if (!refresh) throw new Error('No refresh token');
  const { data } = await axios.post<TokenResponse>(`${BASE_URL}/auth/refresh`, {
    refresh_token: refresh,
  });
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return data.access_token;
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = doRefresh().finally(() => { refreshPromise = null; });
        }
        const accessToken = await refreshPromise;
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        clearTokens();
        // Let the auth store react to the missing session instead of a hard reload.
        window.dispatchEvent(new Event('auth:logout'));
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
  leaderboard: (mode: string) => api.get<User[]>(`/auth/leaderboard?mode=${mode}`),
};

export const gamesApi = {
  history: (limit = 20, offset = 0) =>
    api.get<{ games: GameSummary[]; total: number }>('/games/history', {
      params: { limit, offset },
    }),
  detail: (gameId: string) => api.get(`/games/${gameId}`),
};

export default api;
