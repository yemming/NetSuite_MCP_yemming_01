import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { sessions } from '@/lib/sessions';

export async function GET(req: NextRequest) {
    const encoder = new TextEncoder();
    const sessionId = uuidv4();

    // Create a TransformStream for SSE
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Helper to write SSE events
    const writeEvent = async (event: string, data: string) => {
        await writer.write(encoder.encode(`event: ${event}\ndata: ${data}\n\n`));
    };

    // Start the MCP process
    let mcpProcess: any;

    try {
        // Use npx to execute the package directly, avoiding module resolution issues during build
        // This matches the approach in start_netsuite_server.sh
        
        // Ensure MCP server can find the session file
        // Session file is stored in /app/sessions/{accountId}.json
        // MCP server needs to know where to look for it
        const sessionsDir = path.join(process.cwd(), 'sessions');
        const accountId = process.env.NETSUITE_ACCOUNT_ID;
        const sessionFilePath = path.join(sessionsDir, `${accountId}.json`);
        
        // Read session file and ensure it's accessible to MCP server
        // The MCP server might look for sessions in different locations:
        // 1. Current working directory (cwd) + sessions/
        // 2. node_modules/@suiteinsider/netsuite-mcp/sessions/
        // 3. Environment variable specified location
        let sessionData: any = null;
        if (fs.existsSync(sessionFilePath)) {
            try {
                const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
                sessionData = JSON.parse(sessionContent);
                console.log(`[${sessionId}] Session file loaded: ${sessionFilePath}`);
                
                // Try to also save to MCP server's expected location
                // When using npx, the package might be in a cache directory
                // But we can try to create a symlink or copy to a standard location
                // For now, we rely on the working directory (cwd) being set correctly
                
                // Also try to save to node_modules location if it exists
                const nodeModulesSessionsPath = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp', 'sessions');
                if (fs.existsSync(path.dirname(nodeModulesSessionsPath))) {
                    if (!fs.existsSync(nodeModulesSessionsPath)) {
                        fs.mkdirSync(nodeModulesSessionsPath, { recursive: true });
                    }
                    const mcpSessionPath = path.join(nodeModulesSessionsPath, `${accountId}.json`);
                    fs.writeFileSync(mcpSessionPath, sessionContent);
                    console.log(`[${sessionId}] Session also copied to: ${mcpSessionPath}`);
                }
            } catch (e) {
                console.error(`[${sessionId}] Failed to read session file:`, e);
            }
        } else {
            console.warn(`[${sessionId}] WARNING: Session file not found at: ${sessionFilePath}`);
            console.warn(`[${sessionId}] MCP server will need to authenticate via netsuite_authenticate tool`);
            console.warn(`[${sessionId}] Please visit: ${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/login`);
        }
        
        // Prepare environment variables for MCP server
        // Use process.env as base and override specific values
        const mcpEnv: NodeJS.ProcessEnv = {
            ...process.env,
            NETSUITE_ACCOUNT_ID: process.env.NETSUITE_ACCOUNT_ID || '',
            NETSUITE_CLIENT_ID: process.env.NETSUITE_CLIENT_ID || '',
            NETSUITE_CLIENT_SECRET: process.env.NETSUITE_CLIENT_SECRET || '',
            OAUTH_CALLBACK_PORT: process.env.OAUTH_CALLBACK_PORT || "9090",
        };
        
        // If we have session data, try to pass tokens via environment variables
        // Some MCP implementations support this, though @suiteinsider/netsuite-mcp might not
        // But it doesn't hurt to try
        if (sessionData?.tokens) {
            if (sessionData.tokens.access_token) {
                mcpEnv.NETSUITE_ACCESS_TOKEN = sessionData.tokens.access_token;
            }
            if (sessionData.tokens.refresh_token) {
                mcpEnv.NETSUITE_REFRESH_TOKEN = sessionData.tokens.refresh_token;
            }
        }
        
        // Set working directory to app root where sessions are stored
        // This is critical: MCP server should look for sessions in cwd/sessions/
        console.log(`[${sessionId}] Starting MCP server with cwd: ${process.cwd()}`);
        console.log(`[${sessionId}] Session file location: ${sessionFilePath}`);
        
        mcpProcess = spawn('npx', ['@suiteinsider/netsuite-mcp@latest'], {
            env: mcpEnv,
            cwd: process.cwd() // Set working directory to app root where sessions are stored
        });

        // Store session
        sessions.set(sessionId, { process: mcpProcess, writer });

        // Send endpoint event immediately
        // The endpoint URL where n8n should POST messages
        // We point back to THIS same route, but with POST method (handled below)
        // We append sessionId as query param
        const endpointUrl = `/api/sse?sessionId=${sessionId}`;

        // Start streaming
        (async () => {
            // Send the endpoint event first
            await writeEvent('endpoint', endpointUrl);

            mcpProcess.stdout.on('data', async (data: Buffer) => {
                const lines = data.toString().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        await writeEvent('message', line);
                    }
                }
            });

            mcpProcess.stderr.on('data', (data: Buffer) => {
                console.error(`[${sessionId}] MCP Error: ${data}`);
            });

            mcpProcess.on('close', () => {
                console.log(`[${sessionId}] Process closed`);
                sessions.delete(sessionId);
                writer.close();
            });
        })();

    } catch (error) {
        console.error('Failed to spawn MCP process:', error);
        return new Response('Internal Server Error', { status: 500 });
    }

    // Return the readable stream
    return new Response(stream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId || !sessions.has(sessionId)) {
        return new Response('Session not found', { status: 404 });
    }

    const session = sessions.get(sessionId);
    const body = await req.text(); // Read raw body (JSON-RPC)

    if (session?.process && session.process.stdin) {
        session.process.stdin.write(body + '\n');
    }

    return new Response('Accepted', { status: 202 });
}
