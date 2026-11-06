import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Verifies Supabase Auth access tokens.
 * - Current Supabase projects sign tokens with asymmetric keys published at
 *   <SUPABASE_URL>/auth/v1/.well-known/jwks.json.
 * - Older projects (and the local test suite) use the HS256 JWT secret.
 */
export function createTokenVerifier(config) {
  const verifyOptions = { audience: 'authenticated' };
  let key;
  if (config.SUPABASE_JWT_SECRET) {
    key = new TextEncoder().encode(config.SUPABASE_JWT_SECRET);
  } else {
    const base = config.SUPABASE_URL.replace(/\/$/, '');
    key = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
    verifyOptions.issuer = `${base}/auth/v1`;
  }

  return async function verify(token) {
    const { payload } = await jwtVerify(token, key, verifyOptions);
    if (!payload.sub || payload.role !== 'authenticated') {
      throw new Error('Token is not an authenticated user session');
    }
    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      expiresAt: payload.exp ? payload.exp * 1000 : null,
    };
  };
}
