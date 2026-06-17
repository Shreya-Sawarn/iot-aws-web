// ============================================================
// AUTH STORE — Fake Cognito-compatible
// Future: swap mock service for real Cognito/Amplify
//
// GOVERNANCE: Authentication is standard email + password identity only
// (Sign Up, Sign In, Forgot Password), mirroring AWS Cognito with email
// as username, email verification, and password-based login. There is
// NO role selection anywhere in this flow. Role, tenant ownership and
// permissions are application-level concerns assigned after a user is
// authenticated (Phase-1: defaults to least-privilege below; Phase-2: a
// tenant admin / invite flow assigns role and tenant via a custom
// Cognito attribute or backend record) — the auth flow must never be
// extended to ask "log in as Admin" / "log in as Farmer" or similar.
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, AuthSession, UserRole, User } from '@/types';
import { MOCK_USERS, MOCK_CREDENTIALS } from '@/mock-data/seed';

interface AuthState {
  session: AuthSession | null;
  isLoading: boolean;
  error: string | null;
  infoMessage: string | null;
  /** Phase-1 mock only — surfaces the emailed code since there is no real
   *  email delivery yet. Phase-2: removed once Cognito sends real email. */
  devVerificationCode: string | null;

  // Phase-1 mock identity store — Phase-2: replaced entirely by the
  // Cognito user pool. Self-registered accounts overlay the seed dataset.
  signupUsers: User[];
  signupCredentials: Record<string, string>;
  pendingVerification: Record<string, string>;
  pendingReset: Record<string, string>;

  login: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  confirmSignUp: (email: string, code: string) => Promise<boolean>;
  resendVerificationCode: (email: string) => Promise<boolean>;
  forgotPassword: (email: string) => Promise<boolean>;
  confirmForgotPassword: (email: string, code: string, newPassword: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
  clearInfoMessage: () => void;
  hasRole: (roles: UserRole[]) => boolean;
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
  return {
    user: authUser,
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
      infoMessage: null,
      devVerificationCode: null,

      signupUsers: [],
      signupCredentials: {},
      pendingVerification: {},
      pendingReset: {},

      login: async (email: string, password: string) => {
        set({ isLoading: true, error: null, infoMessage: null });
        await delay(1200); // simulate Cognito latency

        const e = email.toLowerCase();
        const expectedPassword = get().signupCredentials[e] ?? MOCK_CREDENTIALS[e];
        if (!expectedPassword) {
          set({ isLoading: false, error: 'No account found with this email.' });
          return false;
        }
        if (expectedPassword !== password) {
          set({ isLoading: false, error: 'Incorrect password.' });
          return false;
        }

        const user = get().signupUsers.find(u => u.user_email === e)
          ?? MOCK_USERS.find(u => u.user_email.toLowerCase() === e);
        if (!user) {
          set({ isLoading: false, error: 'No account found with this email.' });
          return false;
        }
        if (user.account_status === 'pending') {
          set({ isLoading: false, error: 'Please verify your email before signing in.' });
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

      signUp: async (email: string, password: string) => {
        set({ isLoading: true, error: null, infoMessage: null });
        await delay(800); // simulate Cognito signUp latency

        const e = email.toLowerCase();
        if (get().signupCredentials[e] || MOCK_CREDENTIALS[e]) {
          set({ isLoading: false, error: 'An account with this email already exists.' });
          return false;
        }
        if (password.length < 8) {
          set({ isLoading: false, error: 'Password must be at least 8 characters.' });
          return false;
        }

        const code = generateCode();
        const newUser: User = {
          user_id: `USR-${Date.now()}`,
          // Tenant ownership is an application-level concern assigned after
          // signup (Phase-2: invite flow / backend record) — never part of
          // the authentication step itself.
          tenant_id: 'TENANT_UNASSIGNED',
          user_email: e,
          user_name: e.split('@')[0],
          // Least-privilege default. Real role is an application-level
          // concern assigned later by a tenant admin — not chosen at signup.
          role: 'read_only_auditor',
          account_status: 'pending',
          mfa_enabled: false,
          assigned_site_ids: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        set(state => ({
          signupUsers: [...state.signupUsers, newUser],
          signupCredentials: { ...state.signupCredentials, [e]: password },
          pendingVerification: { ...state.pendingVerification, [e]: code },
          isLoading: false,
          devVerificationCode: code,
          infoMessage: 'Account created. Enter the verification code sent to your email.',
        }));
        return true;
      },

      confirmSignUp: async (email: string, code: string) => {
        set({ isLoading: true, error: null });
        await delay(500);

        const e = email.toLowerCase();
        const expected = get().pendingVerification[e];
        if (!expected || expected !== code) {
          set({ isLoading: false, error: 'Invalid or expired verification code.' });
          return false;
        }

        set(state => {
          const { [e]: _removed, ...rest } = state.pendingVerification;
          return {
            signupUsers: state.signupUsers.map(u =>
              u.user_email === e ? { ...u, account_status: 'active', updated_at: new Date().toISOString() } : u
            ),
            pendingVerification: rest,
            isLoading: false,
            devVerificationCode: null,
            infoMessage: 'Email verified. You can now sign in.',
          };
        });
        return true;
      },

      resendVerificationCode: async (email: string) => {
        const e = email.toLowerCase();
        await delay(400);
        const code = generateCode();
        set(state => ({
          pendingVerification: { ...state.pendingVerification, [e]: code },
          devVerificationCode: code,
          infoMessage: 'Verification code resent.',
        }));
        return true;
      },

      forgotPassword: async (email: string) => {
        set({ isLoading: true, error: null, infoMessage: null });
        await delay(800);

        const e = email.toLowerCase();
        const exists = (get().signupCredentials[e] ?? MOCK_CREDENTIALS[e]) !== undefined;
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
            signupCredentials: { ...state.signupCredentials, [e]: newPassword },
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
      partialize: (state) => ({
        session: state.session,
        signupUsers: state.signupUsers,
        signupCredentials: state.signupCredentials,
      }),
    }
  )
);
