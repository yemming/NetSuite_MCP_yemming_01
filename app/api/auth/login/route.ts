import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { generatePKCE } from '@/lib/pkce';

export async function GET() {
    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const clientId = process.env.NETSUITE_CLIENT_ID;
    // In production, this should be the Zeabur URL. For now, we default to localhost if not set, 
    // but the user MUST set APP_BASE_URL in Zeabur.
    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/callback`;

    if (!accountId || !clientId) {
        return NextResponse.json({ error: 'Missing NetSuite configuration' }, { status: 500 });
    }

    const state = crypto.randomBytes(16).toString('hex');
    
    // Generate PKCE challenge pair (required by NetSuite MCP)
    const pkce = generatePKCE();

    // Scope should match what's enabled in NetSuite Integration settings
    // IMPORTANT: NetSuite MCP Server uses 'mcp' scope with PKCE
    // The MCP Server (patched_manager.js) requests 'mcp' scope, so we must use the same here
    // Common scope values:
    //   - 'mcp' for NetSuite MCP Server (required for MCP tools)
    //   - 'rest_webservices' for REST Web Services (legacy, not compatible with MCP)
    //   - 'restlets' for RESTlets
    //   - 'suiteanalytics_connect' for SuiteAnalytics Connect
    // NOTE: If your NetSuite Integration doesn't have 'mcp' scope, you may need to:
    //   1. Check NetSuite Integration settings for available scopes
    //   2. Use the scope that matches your Integration configuration
    const scope = process.env.NETSUITE_SCOPE || 'mcp'; // Default to 'mcp' for MCP Server compatibility

    // NetSuite OAuth 2.0 Authorization URL with PKCE
    // Note: The domain depends on the account type (Production vs Sandbox).
    // For most accounts: https://<accountID>.app.netsuite.com
    // Account ID in URL must be lowercase and underscores replaced with hyphens
    const accountDomain = accountId.toLowerCase().replace(/_/g, '-');
    
    // Build authorization URL with PKCE parameters
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: scope,
        state: state,
        code_challenge: pkce.code_challenge,
        code_challenge_method: pkce.code_challenge_method
    });
    
    const authUrl = `https://${accountDomain}.app.netsuite.com/app/login/oauth2/authorize.nl?${params.toString()}`;

    // Log for debugging (remove in production or use proper logging)
    console.log('OAuth Authorization URL with PKCE:', {
        accountId,
        accountDomain,
        redirectUri,
        scope,
        hasPKCE: true,
        codeChallenge: pkce.code_challenge.substring(0, 10) + '...',
        challengeMethod: pkce.code_challenge_method,
        authUrl: authUrl.replace(clientId, 'CLIENT_ID_HIDDEN')
    });

    // Create response with redirect
    const response = NextResponse.redirect(authUrl);
    
    // Store code_verifier in HTTP-only cookie for security
    // This will be used in the callback to exchange the code for tokens
    response.cookies.set('pkce_verifier', pkce.code_verifier, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes (OAuth code expires quickly)
        path: '/'
    });
    
    // Also store state for verification
    response.cookies.set('oauth_state', state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600,
        path: '/'
    });

    return response;
}
