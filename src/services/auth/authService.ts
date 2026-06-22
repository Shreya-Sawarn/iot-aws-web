// ============================================================
// AUTH: Auth Service
// Phase-1: mock email/password identity against pre-provisioned seed data
// Phase-2: swap for AWS Cognito (Amplify SDK or direct Cognito API)
//
// GOVERNANCE: Authentication is email + password only — Sign In, Forgot
// Password. There is no public self-registration: accounts are created
// or approved by E-Actuell or a tenant authority (Phase-2: Cognito
// AdminCreateUser via an internal admin tool, never exposed here).
// Role/tenant/site/device authorization is scoped and time-bounded via
// session.access_grants — never part of this service's surface.
// ============================================================

import { useAuthStore, type AccessScope } from '@/store/authStore';
import type { UserRole } from '@/types';

/**
 * Sign in with email and password.
 * Phase-2: replace with Cognito.signIn(email, password) — email is the
 * Cognito username (Email Alias / Username = Email pool configuration).
 */
export async function login(email: string, password: string): Promise<boolean> {
  return useAuthStore.getState().login(email, password);
}

/**
 * Request a password reset code by email.
 * Phase-2: replace with Cognito.forgotPassword(email).
 */
export async function forgotPassword(email: string): Promise<boolean> {
  return useAuthStore.getState().forgotPassword(email);
}

/**
 * Confirm a password reset using the emailed code and a new password.
 * Phase-2: replace with Cognito.forgotPasswordSubmit(email, code, newPassword).
 */
export async function confirmForgotPassword(email: string, code: string, newPassword: string): Promise<boolean> {
  return useAuthStore.getState().confirmForgotPassword(email, code, newPassword);
}

/**
 * Logout current session.
 * Phase-2: replace with Cognito.signOut()
 */
export function logout(): void {
  useAuthStore.getState().logout();
}

/**
 * Check if the current user has one of the given roles, optionally scoped
 * to a tenant/site/zone/device. Phase-2: backed by a UserAccessGrants
 * lookup (DynamoDB) instead of the in-session mock grant list.
 */
export function hasRole(roles: UserRole[], scope?: AccessScope): boolean {
  return useAuthStore.getState().hasRole(roles, scope);
}

/**
 * Device-level authorization check. Default-deny; no role bypass.
 */
export function canAccessDevice(device_id: string): boolean {
  return useAuthStore.getState().canAccessDevice(device_id);
}

/**
 * Get the current authenticated session.
 * Phase-2: return Cognito session + resolved access grants.
 */
export function getSession() {
  return useAuthStore.getState().session;
}
