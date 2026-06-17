// ============================================================
// AUTH: Auth Service
// Phase-1: mock email/password identity against seed + signup data
// Phase-2: swap for AWS Cognito (Amplify SDK or direct Cognito API)
//
// GOVERNANCE: Authentication is standard email + password only — Sign In,
// Sign Up, Forgot Password. There is no role selection in this service.
// Role/tenant/permission assignment is an application-level concern
// applied after authentication, never part of the auth flow itself.
// ============================================================

import { useAuthStore } from '@/store/authStore';
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
 * Create a new account with email and password.
 * Phase-2: replace with Cognito.signUp({ username: email, password }).
 * Cognito sends the verification email; no role or tenant is set here.
 */
export async function signUp(email: string, password: string): Promise<boolean> {
  return useAuthStore.getState().signUp(email, password);
}

/**
 * Confirm a new account using the emailed verification code.
 * Phase-2: replace with Cognito.confirmSignUp(email, code).
 */
export async function confirmSignUp(email: string, code: string): Promise<boolean> {
  return useAuthStore.getState().confirmSignUp(email, code);
}

/**
 * Resend the email verification code.
 * Phase-2: replace with Cognito.resendSignUpCode(email).
 */
export async function resendVerificationCode(email: string): Promise<boolean> {
  return useAuthStore.getState().resendVerificationCode(email);
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
 * Check if the current user has one of the given roles.
 * Role is an application-level attribute, not part of the Cognito identity
 * itself — Phase-2: read from a backend-issued custom:role claim (set by a
 * tenant admin / invite flow after signup, not chosen during auth).
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
