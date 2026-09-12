import { User } from '../types';
import { api, getAdminToken, clearAdminToken } from './api';

export interface AdminSessionResult {
  isAuthenticated: boolean;
  user?: User;
  token?: string;
  error?: string;
  isExpired?: boolean;
}

// Singleton state to guarantee exactly ONE in-flight promise and stable memory cache
let inFlightPromise: Promise<AdminSessionResult> | null = null;
let memoryCache: AdminSessionResult | null = null;

export const adminAuthManager = {
  /**
   * Synchronous check to determine if the admin is already authenticated.
   * Checks memory cache and secure sessionStorage.
   */
  getInstantSession(): AdminSessionResult | null {
    if (memoryCache && memoryCache.isAuthenticated && memoryCache.user) {
      return memoryCache;
    }

    try {
      if (typeof sessionStorage !== 'undefined') {
        const isVerified = sessionStorage.getItem('maxtv_admin_verified') === 'true';
        const token = sessionStorage.getItem('maxtv_admin_token') || getAdminToken();
        const userStr = sessionStorage.getItem('maxtv_admin_user');

        if (isVerified && token && userStr) {
          const user = JSON.parse(userStr);
          if (user && user.role === 'admin') {
            memoryCache = {
              isAuthenticated: true,
              user,
              token
            };
            return memoryCache;
          }
        }
      }
    } catch {
      // ignore JSON parse errors
    }

    return null;
  },

  /**
   * Performs an asynchronous verification using a SINGLE shared promise.
   * Prevents multiple concurrent API calls, race conditions, or component re-render loops.
   */
  verifySession(): Promise<AdminSessionResult> {
    // 1. Return existing instant session if already verified
    const instant = this.getInstantSession();
    if (instant && instant.isAuthenticated) {
      return Promise.resolve(instant);
    }

    // 2. Check if an admin token even exists
    const token = getAdminToken();
    if (!token) {
      const result: AdminSessionResult = {
        isAuthenticated: false,
        error: 'Nenhuma sessão administrativa ativa'
      };
      memoryCache = result;
      return Promise.resolve(result);
    }

    // 3. Reuse in-flight promise if one is already in progress
    if (inFlightPromise) {
      return inFlightPromise;
    }

    // 4. Launch exactly ONE verification promise
    inFlightPromise = (async (): Promise<AdminSessionResult> => {
      try {
        const res = await api.verifyAdminSession(token);

        if (res.valid && res.user && res.user.role === 'admin') {
          const successResult: AdminSessionResult = {
            isAuthenticated: true,
            user: res.user,
            token
          };

          memoryCache = successResult;

          // Cache in sessionStorage for fast restores
          try {
            sessionStorage.setItem('maxtv_admin_verified', 'true');
            sessionStorage.setItem('maxtv_admin_token', token);
            sessionStorage.setItem('maxtv_admin_user', JSON.stringify(res.user));
          } catch {}

          return successResult;
        }

        // Token invalid or user is not admin
        clearAdminToken();
        this.clearSessionStorage();

        const failureResult: AdminSessionResult = {
          isAuthenticated: false,
          isExpired: true,
          error: 'Sessão administrativa expirada ou inválida.'
        };
        memoryCache = failureResult;
        return failureResult;
      } catch (err: any) {
        clearAdminToken();
        this.clearSessionStorage();

        const errorResult: AdminSessionResult = {
          isAuthenticated: false,
          isExpired: true,
          error: err.message || 'Falha ao conectar com o servidor para validar sessão.'
        };
        memoryCache = errorResult;
        return errorResult;
      } finally {
        inFlightPromise = null;
      }
    })();

    return inFlightPromise;
  },

  /**
   * Explicitly sets a valid admin session after successful credentials entry (email & password).
   */
  setSessionSuccess(user: User, token?: string): void {
    const successResult: AdminSessionResult = {
      isAuthenticated: true,
      user,
      token
    };
    memoryCache = successResult;

    try {
      sessionStorage.setItem('maxtv_admin_verified', 'true');
      if (token) sessionStorage.setItem('maxtv_admin_token', token);
      sessionStorage.setItem('maxtv_admin_user', JSON.stringify(user));
      localStorage.setItem('maxtv_user', JSON.stringify(user));
    } catch {}
  },

  /**
   * Clears the current admin session completely.
   */
  clearSession(): void {
    memoryCache = null;
    inFlightPromise = null;
    clearAdminToken();
    this.clearSessionStorage();
  },

  clearSessionStorage(): void {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem('maxtv_admin_verified');
        sessionStorage.removeItem('maxtv_admin_token');
        sessionStorage.removeItem('maxtv_admin_user');
      }
    } catch {}
  }
};
