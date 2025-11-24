import crypto from 'crypto';

/**
 * PKCE (Proof Key for Code Exchange) utilities
 * Used for secure OAuth 2.0 authorization without client secrets
 */

/**
 * Generate a random code verifier (base64url encoded random string)
 * @returns base64url encoded random string (43-128 characters)
 */
export function generateCodeVerifier(): string {
    // Generate 32 random bytes (256 bits)
    const randomBytes = crypto.randomBytes(32);
    
    // Base64url encode (URL-safe base64)
    return base64UrlEncode(randomBytes);
}

/**
 * Generate code challenge from code verifier using SHA-256
 * @param verifier - The code verifier
 * @returns base64url encoded SHA-256 hash of verifier
 */
export function generateCodeChallenge(verifier: string): string {
    // Hash the verifier with SHA-256
    const hash = crypto.createHash('sha256').update(verifier).digest();
    
    // Base64url encode the hash
    return base64UrlEncode(hash);
}

/**
 * Generate PKCE challenge pair (verifier and challenge)
 * @returns Object with code_verifier, code_challenge, and code_challenge_method
 */
export function generatePKCE() {
    const code_verifier = generateCodeVerifier();
    const code_challenge = generateCodeChallenge(code_verifier);
    
    return {
        code_verifier,
        code_challenge,
        code_challenge_method: 'S256' as const // NetSuite requires S256 (SHA-256)
    };
}

/**
 * Base64url encode (URL-safe base64)
 * @param buffer - Buffer to encode
 * @returns base64url encoded string
 */
function base64UrlEncode(buffer: Buffer): string {
    return buffer
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

