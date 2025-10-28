/**
 * Auth Context Module
 * 
 * PROBLEM THIS SOLVES:
 * =====================
 * In a multi-user HTTP server, we need to pass authentication information from Express
 * middleware (where it's extracted from HTTP headers) down to MCP tool handlers (where
 * it's used for authorization checks). We can't pass this as function parameters because:
 * 
 * 1. The MCP SDK controls the tool handler signatures
 * 2. Passing auth through every intermediate function is tedious ("parameter drilling")
 * 3. We need to maintain request isolation - each concurrent request must have its own
 *    auth context, even though Node.js is single-threaded with async operations
 * 
 * SOLUTION: AsyncLocalStorage
 * ============================
 * Node.js's AsyncLocalStorage provides "async-aware thread-local storage". Think of it as:
 * - A magic global variable that has different values for each async operation chain
 * - Similar to thread-local storage in multi-threaded languages, but works with Node's
 *   async/await model
 * - Maintains separate storage for each request, even when they're processed concurrently
 * 
 * HOW IT WORKS:
 * =============
 * 1. Express middleware validates the token and extracts auth info
 * 2. Before handling the MCP request, we wrap it with runWithAuthContext()
 * 3. All code within that async chain can call getAuthContext() to retrieve auth info
 * 4. When the request completes, the context is automatically cleaned up
 * 5. Different concurrent requests maintain completely separate contexts
 * 
 * EXAMPLE FLOW:
 * =============
 * Request 1 (User A):  Middleware → runWithAuthContext(userA) → Tool calls isAuthenticated() → Gets User A's auth
 * Request 2 (User B):  Middleware → runWithAuthContext(userB) → Tool calls isAuthenticated() → Gets User B's auth
 *   ↑ These can run concurrently without interfering with each other!
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Authentication context data structure
 * Contains all auth-related information for a single HTTP request
 */
export interface AuthContext {
  /** The raw JWT access token from the Authorization header */
  token?: string;

  /** Parsed and validated claims from the JWT (e.g., sub, email, scopes) */
  tokenClaims?: any;

  /** Whether the request has been successfully authenticated */
  isAuthenticated: boolean;

  /** Unique session identifier for this MCP session */
  sessionId?: string;
}

/**
 * AsyncLocalStorage instance - the "magic" that makes per-request context work
 * 
 * This creates an isolated storage space for each async operation chain.
 * When you call .run(context, fn), all code executed within fn (including
 * async operations) can retrieve that context by calling .getStore().
 * 
 * Key guarantee: Even if 1000 requests are being processed concurrently,
 * each one maintains its own separate context.
 */
const authContextStorage = new AsyncLocalStorage<AuthContext>();

/**
 * Run a function within a specific authentication context
 * 
 * This is the "entry point" that establishes the auth context for an entire
 * async operation chain. Everything that happens inside `fn` (including all
 * async operations it spawns) will have access to this context.
 * 
 * @param context - The authentication context to establish
 * @param fn - The function to run within this context (typically handles the HTTP request)
 * @returns The return value of fn
 * 
 * @example
 * // In streamable-http.ts:
 * const authContext = {
 *   token: req.token,
 *   tokenClaims: req.tokenClaims,
 *   isAuthenticated: true,
 *   sessionId: 'abc-123'
 * };
 * 
 * await runWithAuthContext(authContext, async () => {
 *   // All code here (and functions it calls) can access the context
 *   await transport.handleRequest(req, res, req.body);
 * });
 */
export function runWithAuthContext<T>(context: AuthContext, fn: () => T): T {
  return authContextStorage.run(context, fn);
}

/**
 * Get the current authentication context
 * 
 * Retrieves the auth context that was established by runWithAuthContext().
 * This works anywhere in the async call chain - no need to pass the context
 * as a parameter through every function.
 * 
 * @returns The current auth context, or undefined if not within a context
 * 
 * IMPORTANT: This only works if called from within a runWithAuthContext() block.
 * If called outside of any context, it returns undefined.
 * 
 * @example
 * // Deep in your code, far from the HTTP layer:
 * const context = getAuthContext();
 * if (context?.isAuthenticated) {
 *   console.log(`User: ${context.tokenClaims?.email}`);
 * }
 */
export function getAuthContext(): AuthContext | undefined {
  return authContextStorage.getStore();
}

/**
 * Check if the current request is authenticated
 * 
 * Convenience helper for the most common auth check.
 * Use this in MCP tool handlers to require authentication.
 * 
 * @returns true if the request is authenticated, false otherwise
 * 
 * @example
 * // In an MCP tool handler:
 * async ({ length }) => {
 *   if (!isAuthenticated()) {
 *     throw new Error('Authentication required');
 *   }
 *   // ... proceed with authenticated operation
 * }
 */
export function isAuthenticated(): boolean {
  const context = getAuthContext();
  return context?.isAuthenticated ?? false;
}

/**
 * Get the token claims for the current request
 * 
 * Token claims contain user information and permissions extracted from the JWT.
 * Common claims include:
 * - sub: Subject (user identifier)
 * - email: User's email address
 * - scopes: Array of permission scopes
 * - exp: Expiration timestamp
 * - iat: Issued at timestamp
 * 
 * @returns The parsed token claims object, or undefined if not authenticated
 * 
 * @example
 * const claims = getTokenClaims();
 * const username = claims?.sub || claims?.email || 'anonymous';
 * console.log(`Operation performed by: ${username}`);
 */
export function getTokenClaims(): any | undefined {
  const context = getAuthContext();
  return context?.tokenClaims;
}

/**
 * Get the token for the current request
 * 
 * Returns the raw JWT access token. Use this if you need to:
 * - Forward the token to another service
 * - Perform custom token validation
 * - Log token-related information (for debugging only - never log the full token!)
 * 
 * @returns The JWT token string, or undefined if not authenticated
 * 
 * @example
 * const token = getToken();
 * if (token) {
 *   // Forward to another authenticated service
 *   await fetch('https://api.example.com/data', {
 *     headers: { Authorization: `Bearer ${token}` }
 *   });
 * }
 */
export function getToken(): string | undefined {
  const context = getAuthContext();
  return context?.token;
}

/**
 * Get the session ID for the current request
 * 
 * The session ID identifies a specific MCP connection/session.
 * Useful for:
 * - Logging and debugging
 * - Session-specific caching
 * - Tracking user activity across multiple tool calls
 * 
 * @returns The session ID string, or undefined if not available
 * 
 * @example
 * const sessionId = getSessionId();
 * console.log(`Tool called in session: ${sessionId}`);
 */
export function getSessionId(): string | undefined {
  const context = getAuthContext();
  return context?.sessionId;
}

