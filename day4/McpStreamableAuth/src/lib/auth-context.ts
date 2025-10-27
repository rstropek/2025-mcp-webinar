/**
 * Auth Context Module
 * Provides a way to pass authentication information to MCP tools
 * Uses AsyncLocalStorage to maintain per-request authentication state
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface AuthContext {
  token?: string;
  tokenClaims?: any;
  isAuthenticated: boolean;
  sessionId?: string;
}

const authContextStorage = new AsyncLocalStorage<AuthContext>();

/**
 * Run a function within a specific authentication context
 */
export function runWithAuthContext<T>(context: AuthContext, fn: () => T): T {
  return authContextStorage.run(context, fn);
}

/**
 * Get the current authentication context
 */
export function getAuthContext(): AuthContext | undefined {
  return authContextStorage.getStore();
}

/**
 * Check if the current request is authenticated
 */
export function isAuthenticated(): boolean {
  const context = getAuthContext();
  return context?.isAuthenticated ?? false;
}

/**
 * Get the token claims for the current request
 */
export function getTokenClaims(): any | undefined {
  const context = getAuthContext();
  return context?.tokenClaims;
}

/**
 * Get the token for the current request
 */
export function getToken(): string | undefined {
  const context = getAuthContext();
  return context?.token;
}

/**
 * Get the session ID for the current request
 */
export function getSessionId(): string | undefined {
  const context = getAuthContext();
  return context?.sessionId;
}

