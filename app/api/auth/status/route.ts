import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const accountId = process.env.NETSUITE_ACCOUNT_ID;

    if (!accountId) {
        return NextResponse.json({ connected: false });
    }

    try {
        // Use fixed sessions directory to avoid module resolution issues during build
        const sessionsDir = path.join(process.cwd(), 'sessions');

        const filePath = path.join(sessionsDir, `${accountId}.json`);

        if (fs.existsSync(filePath)) {
            return NextResponse.json({ connected: true, accountId });
        }
    } catch (e) {
        // ignore
    }

    return NextResponse.json({ connected: false });
}
