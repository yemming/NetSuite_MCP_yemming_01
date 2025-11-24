import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
    const accountId = process.env.NETSUITE_ACCOUNT_ID;

    if (!accountId) {
        return NextResponse.json({ connected: false });
    }

    try {
        let sessionsDir;
        try {
            const mcpPackagePath = require.resolve('@suiteinsider/netsuite-mcp/package.json');
            const packageDir = path.dirname(mcpPackagePath);
            sessionsDir = path.join(packageDir, 'sessions');
        } catch (e) {
            sessionsDir = path.join(process.cwd(), 'sessions');
        }

        const filePath = path.join(sessionsDir, `${accountId}.json`);

        if (fs.existsSync(filePath)) {
            return NextResponse.json({ connected: true, accountId });
        }
    } catch (e) {
        // ignore
    }

    return NextResponse.json({ connected: false });
}
