import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
        return NextResponse.json({ error }, { status: 400 });
    }

    if (!code) {
        return NextResponse.json({ error: 'No code provided' }, { status: 400 });
    }

    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const clientId = process.env.NETSUITE_CLIENT_ID;
    const clientSecret = process.env.NETSUITE_CLIENT_SECRET; // User needs to provide this!
    // Wait, the previous setup didn't use Client Secret (Public Client?). 
    // The tutorial said "Public Client". If so, we don't need client_secret.
    // But for "Confidential Client" (Server-side), we usually do.
    // If it's a Public Client, we just send client_id.

    const baseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
    const redirectUri = `${baseUrl}/api/callback`;

    if (!accountId || !clientId) {
        return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
    }

    // Exchange code for token
    const accountDomain = accountId.toLowerCase().replace('_', '-');
    const tokenUrl = `https://${accountDomain}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token`;

    try {
        // Construct Basic Auth header if secret exists (Confidential), else just body (Public)
        // Actually, for Public Client, we just send client_id in body.
        // Let's assume Public Client as per previous context.

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri,
            client_id: clientId
        });

        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const tokens = await tokenRes.json();

        if (!tokenRes.ok) {
            console.error('Token exchange failed:', tokens);
            return NextResponse.json({ error: 'Token exchange failed', details: tokens }, { status: 500 });
        }

        // Success! Now construct the session JSON for MCP
        // Use a fixed sessions directory to avoid module resolution issues during build
        // The MCP server will look for sessions in node_modules/@suiteinsider/netsuite-mcp/sessions
        // But we'll use a consistent location that works in both dev and production
        const sessionsDir = path.join(process.cwd(), 'sessions');

        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        const sessionData = {
            pkce: null, // We didn't use PKCE here (simplified flow)
            state: "generated_by_nextjs",
            config: {
                accountId,
                clientId,
                redirectUri
            },
            timestamp: Date.now(),
            tokens: {
                ...tokens,
                accountId,
                clientId
            },
            authenticated: true
        };

        const filePath = path.join(sessionsDir, `${accountId}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));

        // Also save to a persistent location if possible, e.g., /tmp or a volume
        // For Zeabur, if we restart, we lose it unless we use a Volume.
        // But for now, this gets us "Logged In" for the current running instance.

        return NextResponse.redirect(`${baseUrl}?connected=true`);

    } catch (error) {
        console.error('Auth error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
