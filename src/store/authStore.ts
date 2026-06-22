// ============================================================
// AUTH STORE — Fake Cognito-compatible
// Future: swap mock service for real Cognito/Amplify
//
// GOVERNANCE: Authentication is email-based (Sign In, Forgot Password)
// against accounts that already exist. There is NO public self-registration
// — accounts are created or approved by E-Actuell or a tenant authority
// (Phase-1: pre-provisioned in mock-data/seed.ts; Phase-2: Cognito
// AdminCreateUser via an internal admin tool, never a public route).
//
// Authorization is NOT a flat role. Every permission is scoped by
// tenant_id + site_id/zone_id + device_id + role + validity period, held
// as `session.access_grants`. `session.user.role` / `session.user.tenant_id`
// remain for backward-compatible display only — they are never the
// authorization source of truth. Maintainer/admin roles get no global
// bypass anywhere in this file.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, AuthSession, AccessGrant, UserRole, User } from '@/types';
import { MOCK_USERS, MOCK_CREDENTIALS, MOCK_ACCESS_GRANTS } from '@/mock-data/seed';
import { useDeviceStore } from './deviceStore';

export interface AccessScope {
  tenant_id: string;
  site_id?: string;
  zone_id?: string;
  device_id?: string;
}

interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  infoMessage: string | null;
  /** Phase-1 mock only — surfaces the emailed reset code since there is no
   *  real email delivery yet. Phase-2: removed once Cognito sends real email. */
  devVerificationCode: string | null;

  // Phase-1 mock password-reset overlay. This holds ONLY updated password
  // values for accounts that already exist in MOCK_USERS/MOCK_CREDENTIALS —
  // it never creates a new identity, role or tenant assignment. Phase-2:
  // removed entirely; Cognito owns password storage.
  passwordOverrides: Record<string, string>;
  pendingReset: Record<string, string>;

  login: (email: string, password: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  clearInfoMessage: () => void;
  /**
   * Role check. With no `scope`, behaves exactly as before (flat check
   * against session.user.role) — preserves existing call sites unchanged.
   * With a `scope`, checks for an active, currently-valid access grant
   * matching that tenant/site/zone/device and one of the given roles.
   */
  hasRole: (roles: UserRole[], scope?: AccessScope) => boolean;
  /**
   * Device-level authorization. Default-deny: returns false unless an
   * active, currently-valid grant covers this device's tenant/site/device
   * scope. No role receives a global bypass.
   */
  canAccessDevice: (device_id: string) => boolean;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function buildSession(user: User): AuthSession {
  const authUser: AuthUser = {
    user_id: user.user_id,
    user_email: user.user_email,
    user_name: user.user_name,
    role: user.role,
    tenant_id: user.tenant_id,
    account_status: user.account_status,
    mfa_enabled: user.mfa_enabled,
    last_login_at: new Date().toISOString(),
    assigned_site_ids: user.assigned_site_ids,
  };
  const access_grants = MOCK_ACCESS_GRANTS.filter(g => g.user_id === user.user_id);
  return {
    user: authUser,
    access_token: `mock_token_${user.user_id}_${Date.now()}`,
    expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    is_authenticated: true,
    access_grants,
  };
}

function isGrantActiveNow(grant: AccessGrant): boolean {
  const now = new Date().toISOString();
  return grant.valid_from <= now && now <= grant.valid_until;
}

function grantMatchesScope(grant: AccessGrant, scope: AccessScope): boolean {
  if (grant.tenant_id !== scope.tenant_id) return false;
  if (scope.site_id !== undefined && grant.site_id !== undefined && grant.site_id !== scope.site_id) return false;
  if (scope.zone_id !== undefined && grant.zone_id !== undefined && grant.zone_id !== scope.zone_id) return false;
  if (scope.device_id !== undefined && grant.device_id !== undefined && grant.device_id !== scope.device_id) return false;
  return true;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      isLoading: false,
      error: null,
      infoMessage: null,
      devVerificationCode: null,

      passwordOverrides: {},
      pendingReset: {},

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null, infoMessage: null });
        await delay(1200); // simulate Cognito latency

        const e = email.toLowerCase();
        const expectedPassword = get().passwordOverrides[e] ?? MOCK_CREDENTIALS[e];
        if (!expectedPassword) {
          set({ isLoading: false, error: 'No account found with this email.' });
          return false;
        }
        if (expectedPassword !== password) {
          set({ isLoading: false, error: 'Incorrect password.' });
          return false;
        }

        const user = MOCK_USERS.find(u => u.user_email.toLowerCase() === e);
        if (!user) {
          set({ isLoading: false, error: 'No account found with this email.' });
          return false;
        }
        if (user.account_status === 'pending') {
          set({ isLoading: false, error: 'Your account setup is not complete. Contact your administrator.' });
          return false;
        }
        if (user.account_status !== 'active') {
          set({ isLoading: false, error: 'Account is not active. Contact support.' });
          return false;
        }

        const session = buildSession(user);
        set({ session, isLoading: false, error: null });
        return true;
      },

      forgotPassword: async (email: string) => {
        set({ isLoading: true, error: null, infoMessage: null });
        await delay(800);

        const e = email.toLowerCase();
        const exists = (get().passwordOverrides[e] ?? MOCK_CREDENTIALS[e]) !== undefined;
        if (!exists) {
          set({ isLoading: false, error: 'No account found with this email.' });
          return false;
        }

        const code = generateCode();
        set(state => ({
          pendingReset: { ...state.pendingReset, [e]: code },
          isLoading: false,
          devVerificationCode: code,
          infoMessage: 'Password reset code sent to your email.',
        }));
        return true;
      },

      confirmForgotPassword: async (email: string, code: string, newPassword: string) => {
        set({ isLoading: true, error: null });
        await delay(500);

        const e = email.toLowerCase();
        const expected = get().pendingReset[e];
        if (!expected || expected !== code) {
          set({ isLoading: false, error: 'Invalid or expired reset code.' });
          return false;
        }
        if (newPassword.length < 8) {
          set({ isLoading: false, error: 'Password must be at least 8 characters.' });
          return false;
        }

        set(state => {
          const { [e]: _removed, ...rest } = state.pendingReset;
          return {
            passwordOverrides: { ...state.passwordOverrides, [e]: newPassword },
            pendingReset: rest,
            isLoading: false,
            devVerificationCode: null,
            infoMessage: 'Password updated. You can now sign in with your new password.',
          };
        });
        return true;
      },

      logout: () => {
        set({ session: null, error: null, infoMessage: null });
      },

      clearError: () => set({ error: null }),
      clearInfoMessage: () => set({ infoMessage: null }),

      hasRole: (roles: UserRole[], scope?: AccessScope) => {
        const { session } = get();
        if (!session?.is_authenticated) return false;
        if (!scope) {
          // Backward-compatible flat check — unchanged for existing callers.
          return roles.includes(session.user.role);
        }
        return session.access_grants.some(g =>
          roles.includes(g.role) && isGrantActiveNow(g) && grantMatchesScope(g, scope)
        );
      },

      canAccessDevice: (device_id: string) => {
        const { session } = get();
        if (!session?.is_authenticated) return false;

        const device = useDeviceStore.getState().getDeviceById(device_id);
        if (!device) return false; // unknown device — default deny

        const scope: AccessScope = {
          tenant_id: device.tenant_id,
          site_id: device.site_id,
          device_id,
        };
        return session.access_grants.some(g => isGrantActiveNow(g) && grantMatchesScope(g, scope));
      },
    }),
    {
      name: 'orbipulse-auth',
      partialize: (state) => ({
        session: state.session,
        passwordOverrides: state.passwordOverrides,
      }),
    }
  )
);
