import { NextResponse } from 'next/server';
import crypto from 'crypto';

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
    // Store state in cookie or session if needed for security, skipping for MVP simplicity

    // Scope should match what's enabled in NetSuite Integration settings
    // IMPORTANT: NetSuite MCP Server uses 'mcp' scope
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

    // NetSuite OAuth 2.0 Authorization URL
    // Note: The domain depends on the account type (Production vs Sandbox).
    // For most accounts: https://<accountID>.app.netsuite.com
    // Account ID in URL must be lowercase and underscores replaced with hyphens
    const accountDomain = accountId.toLowerCase().replace(/_/g, '-');
    const authUrl = `https://${accountDomain}.app.netsuite.com/app/login/oauth2/authorize.nl?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;

    // Log for debugging (remove in production or use proper logging)
    console.log('OAuth Authorization URL:', {
        accountId,
        accountDomain,
        redirectUri,
        scope,
        authUrl: authUrl.replace(clientId, 'CLIENT_ID_HIDDEN')
    });

    return NextResponse.redirect(authUrl);
}
