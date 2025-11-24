import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    // Get cookies for PKCE verifier and state validation
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split('; ').map(c => {
            const [key, ...v] = c.split('=');
            return [key, v.join('=')];
        })
    );
    
    const pkceVerifier = cookies.pkce_verifier;
    const savedState = cookies.oauth_state;

    if (error) {
        // Provide helpful error messages for common OAuth errors
        let errorMessage = error;
        let suggestions = '';

        if (error === 'scope_mismatch') {
            errorMessage = 'Scope Mismatch - The requested OAuth scope does not match your NetSuite Integration settings';
            suggestions = `
                Solutions:
                1. Check your NetSuite Integration settings - ensure the scope checkbox matches what you're requesting
                2. If using "NetSuite AI Connector Service", set NETSUITE_SCOPE environment variable to the correct value
                3. If using "REST Web Services", ensure NETSUITE_SCOPE=rest_webservices or remove it to use default
                4. Make sure only ONE scope is checked in NetSuite (NetSuite AI Connector Service cannot be used with others)
            `;
        } else if (error === 'access_denied') {
            errorMessage = 'Access Denied - User declined authorization';
            suggestions = 'Please try again and approve the authorization request.';
        } else if (error === 'invalid_client') {
            errorMessage = 'Invalid Client - Client ID is incorrect';
            suggestions = 'Check your NETSUITE_CLIENT_ID environment variable.';
        } else if (error === 'invalid_redirect_uri') {
            errorMessage = 'Invalid Redirect URI - Redirect URI does not match';
            suggestions = 'Ensure APP_BASE_URL is set correctly and matches NetSuite Integration settings.';
        }

        console.error('OAuth Error:', { error, errorDescription, suggestions });
        
        return NextResponse.json({ 
            error: errorMessage,
            error_code: error,
            error_description: errorDescription,
            suggestions: suggestions.trim()
        }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }
    
    // Validate state to prevent CSRF attacks
    if (state && savedState && state !== savedState) {
        console.error('State mismatch:', { received: state, expected: savedState });
        return NextResponse.json({ error: 'Invalid state parameter - possible CSRF attack' }, { status: 400 });
    }
    
    // Validate PKCE verifier exists
    if (!pkceVerifier) {
        console.error('PKCE verifier not found in cookies');
        return NextResponse.json({ 
            error: 'PKCE verifier not found',
            details: 'The authorization session may have expired. Please try again.',
            action: 'Restart the OAuth flow by visiting /api/auth/login'
        }, { status: 400 });
    }

    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const clientId = process.env.NETSUITE_CLIENT_ID;
    const clientSecret = process.env.NETSUITE_CLIENT_SECRET;
    // Note: NetSuite MCP uses Public Client (no client secret) with PKCE for security

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/callback`;

    if (!accountId || !clientId) {
        return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
    }

    // Exchange code for token
    const accountDomain = accountId.toLowerCase().replace('_', '-');
    const tokenUrl = `https://${accountDomain}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

    try {
        // NetSuite OAuth 2.0 token exchange with PKCE
        // NetSuite MCP Server uses Public Client pattern with PKCE (no client secret)
        
        const bodyParams: Record<string, string> = {
            grant_type: 'authorization_code',
            code: code!,
            redirect_uri: redirectUri,
            code_verifier: pkceVerifier  // ✅ Include PKCE verifier (critical!)
        };

        // Prepare headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/x-www-form-urlencoded'
        };

        // Public Client pattern: include client_id in body (no Authorization header)
        // This matches NetSuite MCP Server's implementation
        bodyParams.client_id = clientId;
        
        // Note: If you have a client secret (Confidential Client), you can use Basic Auth
        // but NetSuite MCP recommends Public Client with PKCE for better security
        if (clientSecret) {
            console.warn('⚠️ Client secret provided, but NetSuite MCP uses Public Client with PKCE');
            // Optionally use Basic Auth if you prefer Confidential Client:
            // const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
            // headers['Authorization'] = `Basic ${credentials}`;
            // delete bodyParams.client_id;
        }

        const body = new URLSearchParams(bodyParams);

        // Log token exchange request for debugging
        // IMPORTANT: redirect_uri must EXACTLY match what was used in authorization
        console.log('Token exchange request with PKCE:', {
            tokenUrl,
            redirectUri,
            redirectUriEncoded: encodeURIComponent(redirectUri),
            accountId,
            clientId: clientId.substring(0, 10) + '...',
            hasClientSecret: !!clientSecret,
            hasPKCEVerifier: !!pkceVerifier,
            verifierLength: pkceVerifier?.length || 0,
            verifierPrefix: pkceVerifier?.substring(0, 10) || 'none',
            codeLength: code?.length || 0,
            codePrefix: code?.substring(0, 10) || 'none'
        });

        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers,
            body: body.toString()
        });

        const tokens = await tokenRes.json();

        // Log token response for debugging (including scope)
        console.log('Token exchange response:', {
            success: tokenRes.ok,
            status: tokenRes.status,
            hasAccessToken: !!tokens.access_token,
            hasRefreshToken: !!tokens.refresh_token,
            tokenType: tokens.token_type,
            expiresIn: tokens.expires_in,
            scope: tokens.scope || 'not provided in response',
            error: tokens.error || null
        });

        if (!tokenRes.ok) {
            console.error('Token exchange failed:', {
                status: tokenRes.status,
                statusText: tokenRes.statusText,
                error: tokens,
                requestDetails: {
                    redirectUri,
                    accountId,
                    hasCode: !!code
                }
            });

            // Provide helpful error messages
            let errorMessage = 'Token exchange failed';
            let suggestions = '';

            if (tokens.error === 'invalid_grant') {
                errorMessage = 'Invalid Grant - The authorization code is invalid, expired, or has already been used';
                suggestions = `
                    Common causes:
                    1. Authorization code was already used (codes can only be used once)
                    2. Authorization code expired (usually expires within minutes)
                    3. Redirect URI mismatch between authorization and token exchange
                    4. Try the OAuth flow again from the beginning
                    
                    Solutions:
                    1. Go back to the home page and click "Connect NetSuite" again
                    2. Complete the authorization flow in one session (don't wait too long)
                    3. Ensure APP_BASE_URL is set correctly and matches NetSuite Integration settings
                    4. Check that redirect_uri in token exchange matches exactly what was used in authorization
                `;
            } else if (tokens.error === 'invalid_client') {
                errorMessage = 'Invalid Client - Client ID or Client Secret is incorrect';
                suggestions = 'Check your NETSUITE_CLIENT_ID and NETSUITE_CLIENT_SECRET environment variables.';
            } else if (tokens.error === 'invalid_redirect_uri') {
                errorMessage = 'Invalid Redirect URI - Redirect URI does not match';
                suggestions = 'Ensure APP_BASE_URL is set correctly and matches NetSuite Integration settings exactly.';
            }

            return NextResponse.json({ 
                error: errorMessage,
                error_code: tokens.error,
                error_description: tokens.error_description,
                details: tokens,
                debug_info: {
                    redirect_uri_used: redirectUri,
                    account_id: accountId,
                    has_code: !!code,
                    app_base_url: baseUrl
                },
                suggestions: suggestions.trim()
            }, { status: 500 });
        }

        // Success! Now construct the session JSON for MCP
        // Use a fixed sessions directory to avoid module resolution issues during build
        // The MCP server will look for sessions in node_modules/@suiteinsider/netsuite-mcp/sessions
        // But we'll use a consistent location that works in both dev and production
        const sessionsDir = path.join(process.cwd(), 'sessions');

        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        // CRITICAL: Always use lowercase for Account ID to match MCP server expectations
        const normalizedAccountId = accountId.toLowerCase();

        const sessionData = {
            pkce: null, // Clear PKCE after successful token exchange (security best practice)
            state: state || "oauth_state",
            config: {
                accountId: normalizedAccountId, // Use lowercase for consistency
                clientId,
                redirectUri,
                scope: tokens.scope || process.env.NETSUITE_SCOPE || 'mcp' // Store scope for reference
            },
            timestamp: Date.now(),
            tokens: {
                ...tokens,
                // Ensure these fields are present in tokens object as well
                accountId: normalizedAccountId,
                clientId
            },
            authenticated: true,
            usedPKCE: true // Flag indicating PKCE was used for this session
        };

        // Log scope and PKCE information for debugging
        console.log('Session created with PKCE and scope:', {
            tokenScope: tokens.scope || 'not provided',
            requestedScope: process.env.NETSUITE_SCOPE || 'mcp',
            accountId: normalizedAccountId,
            pkceUsed: true
        });

        // Save with lowercase filename only (consistent with MCP server)
        const filePath = path.join(sessionsDir, `${normalizedAccountId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
        
        console.log(`✅ Session saved: ${filePath}`);
        console.log(`📋 Account ID (normalized): ${normalizedAccountId}`);

        // Also try to save to MCP server's expected location
        // When using npx, the MCP server might look in its own node_modules
        // Try to find and write to that location as well
        try {
            // Try to find node_modules/@suiteinsider/netsuite-mcp/sessions
            const nodeModulesPath = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp', 'sessions');
            if (fs.existsSync(path.dirname(nodeModulesPath))) {
                if (!fs.existsSync(nodeModulesPath)) {
                    fs.mkdirSync(nodeModulesPath, { recursive: true });
                }
                const mcpSessionPath = path.join(nodeModulesPath, `${normalizedAccountId}.json`);
                fs.writeFileSync(mcpSessionPath, JSON.stringify(sessionData, null, 2));
                
                console.log(`✅ Session also saved to MCP location: ${mcpSessionPath}`);
            }
        } catch (e) {
            // If MCP package is not installed locally (using npx), this will fail
            // That's okay, the main session file is saved above
            console.log('Could not save to MCP node_modules location (using npx, this is expected)');
        }

        // Also save to a persistent location if possible, e.g., /tmp or a volume
        // For Zeabur, if we restart, we lose it unless we use a Volume.
        // But for now, this gets us "Logged In" for the current running instance.

        // Clear PKCE cookies after successful authentication (security best practice)
        const response = NextResponse.redirect(`${baseUrl}?connected=true`);
        response.cookies.delete('pkce_verifier');
        response.cookies.delete('oauth_state');
        
        return response;

    } catch (error) {
        console.error('Auth error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
