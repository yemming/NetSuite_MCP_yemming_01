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

    const scope = 'rest_webservices'; // Standard scope

    // NetSuite OAuth 2.0 Authorization URL
    // Note: The domain depends on the account type (Production vs Sandbox).
    // For most accounts: https://<accountID>.app.netsuite.com
    // Account ID in URL must be lowercase.
    const accountDomain = accountId.toLowerCase().replace('_', '-');
    const authUrl = `https://${accountDomain}.app.netsuite.com/app/login/oauth2/authorize.nl?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`;

    return NextResponse.redirect(authUrl);
}
