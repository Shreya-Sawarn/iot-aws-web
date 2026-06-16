// ============================================================
// AUTH STORE — Fake Cognito-compatible
// Future: swap mock service for real Cognito/Amplify
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, AuthSession, UserRole } from '@/types';
import { MOCK_USERS, MOCK_CREDENTIALS } from '@/mock-data/seed';

interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  hasRole: (roles: UserRole[]) => boolean;
  canAccessDevice: (device_id: string) => boolean;
}

function buildSession(user: typeof MOCK_USERS[0]): AuthSession {
  return {
    user: {
      user_id: user.user_id,
      user_email: user.user_email,
      user_name: user.user_name,
      role: user.role,
      tenant_id: user.tenant_id,
      account_status: user.account_status,
      mfa_enabled: user.mfa_enabled,
      last_login_at: new Date().toISOString(),
      assigned_site_ids: user.assigned_site_ids,
    },
    access_token: `mock_token_${user.user_id}_${Date.now()}`,
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    is_authenticated: true,
  };
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      isLoading: false,
      error: null,

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null });
        await new Promise(r => setTimeout(r, 1200)); // simulate Cognito latency

        const expectedPassword = MOCK_CREDENTIALS[email.toLowerCase()];
        if (!expectedPassword) {
          set({ isLoading: false, error: 'User not found. Check your email address.' });
          return false;
        }
        if (expectedPassword !== password) {
          set({ isLoading: false, error: 'Incorrect password.' });
          return false;
        }

        const user = MOCK_USERS.find(u => u.user_email.toLowerCase() === email.toLowerCase());
        if (!user || user.account_status !== 'active') {
          set({ isLoading: false, error: 'Account is not active. Contact support.' });
          return false;
        }

        const session = buildSession(user);
        set({ session, isLoading: false, error: null });
        return true;
      },

      logout: () => {
        set({ session: null, error: null });
      },

      clearError: () => set({ error: null }),

      hasRole: (roles: UserRole[]) => {
        const { session } = get();
        if (!session?.is_authenticated) return false;
        return roles.includes(session.user.role);
      },

      canAccessDevice: (device_id: string) => {
        const { session } = get();
        if (!session?.is_authenticated) return false;
        const adminRoles: UserRole[] = ['founder_admin', 'manufacturer_admin'];
        if (adminRoles.includes(session.user.role)) return true;
        return true; // simplified — real impl checks device ownership
      },
    }),
    {
      name: 'orbipulse-auth',
      partialize: (state) => ({ session: state.session }),
    }
  )
);
