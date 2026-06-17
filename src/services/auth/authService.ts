// ============================================================
// AUTH: Auth Service
// Phase-1: mock login against seed data
// Phase-2: swap for AWS Cognito (Amplify SDK or direct Cognito API)
// ============================================================

import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

/**
 * Login with email and password.
 * Phase-2: replace with Cognito.signIn(email, password)
 */
export async function login(email: string, password: string): Promise<boolean> {
  return useAuthStore.getState().login(email, password);
}

/**
 * Logout current session.
 * Phase-2: replace with Cognito.signOut()
 */
export function logout(): void {
  useAuthStore.getState().logout();
}

/**
 * Check if the current user has one of the given roles.
 * Phase-2: read from Cognito JWT claims (custom:role attribute).
 */
export function hasRole(roles: UserRole[]): boolean {
  return useAuthStore.getState().hasRole(roles);
}

/**
 * Get the current authenticated session.
 * Phase-2: return Cognito session + user pool attributes.
 */
export function getSession() {
  return useAuthStore.getState().session;
}
