import { create } from 'zustand';
import { ApiError, apiClient, type AdminUserDto } from '@/shared/api/client';

const ADMIN_SESSION_CACHE_KEY = 'mast2-admin-session-cache-v1';

export type AuthStatus = 'unknown' | 'authenticated' | 'unauthenticated';

interface CachedAdminSession {
  user: AdminUserDto;
  cachedAt: string;
}

function readCachedAdminSession(): CachedAdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedAdminSession>;
    if (parsed?.user?.id && parsed?.user?.username) {
      return {
        user: parsed.user,
        cachedAt: parsed.cachedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore cache read error
  }
  return null;
}

function writeCachedAdminSession(user: AdminUserDto | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!user) {
      window.localStorage.removeItem(ADMIN_SESSION_CACHE_KEY);
    } else {
      window.localStorage.setItem(
        ADMIN_SESSION_CACHE_KEY,
        JSON.stringify({ user, cachedAt: new Date().toISOString() })
      );
    }
  } catch {
    // Ignore cache write error
  }
}

interface AuthState {
  status: AuthStatus;
  user: AdminUserDto | null;
  offlineCached: boolean;
  checking: boolean;
  errorMessage: string | null;

  checkSession: () => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  markSessionExpired: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,
  offlineCached: false,
  checking: false,
  errorMessage: null,

  checkSession: async () => {
    set({ checking: true, errorMessage: null });
    try {
      const res = await apiClient.getSession();
      if (res.authenticated && res.user) {
        writeCachedAdminSession(res.user);
        set({
          status: 'authenticated',
          user: res.user,
          offlineCached: false,
          checking: false,
        });
        return true;
      }
      writeCachedAdminSession(null);
      set({
        status: 'unauthenticated',
        user: null,
        offlineCached: false,
        checking: false,
      });
      return false;
    } catch (err) {
      // Offline grace: allow an already authenticated field engineer to work offline and sync later
      const cached = readCachedAdminSession();
      const isNetworkIssue =
        !(err instanceof ApiError) ||
        (typeof navigator !== 'undefined' && !navigator.onLine);
      if (isNetworkIssue && cached) {
        set({
          status: 'authenticated',
          user: cached.user,
          offlineCached: true,
          checking: false,
        });
        return true;
      }
      set({
        status: 'unauthenticated',
        user: null,
        offlineCached: false,
        checking: false,
      });
      return false;
    }
  },

  login: async (username, password) => {
    set({ checking: true, errorMessage: null });
    try {
      const res = await apiClient.login(username, password);
      writeCachedAdminSession(res.user);
      set({
        status: 'authenticated',
        user: res.user,
        offlineCached: false,
        checking: false,
        errorMessage: null,
      });
      return true;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to sign in. Check your connection and credentials.';
      set({
        status: 'unauthenticated',
        user: null,
        offlineCached: false,
        checking: false,
        errorMessage: message,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await apiClient.logout();
    } catch {
      // Ignore network errors during logout
    }
    writeCachedAdminSession(null);
    set({
      status: 'unauthenticated',
      user: null,
      offlineCached: false,
      errorMessage: null,
    });
  },

  markSessionExpired: () => {
    writeCachedAdminSession(null);
    set({
      status: 'unauthenticated',
      user: null,
      offlineCached: false,
      errorMessage: 'Your admin session has expired. Please sign in again.',
    });
  },

  clearError: () => set({ errorMessage: null }),
}));
