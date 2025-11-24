import { NextRequest } from 'next/server';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
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
        mcpProcess = spawn('npx', ['@suiteinsider/netsuite-mcp@latest'], {
            env: {
                ...process.env,
                NETSUITE_ACCOUNT_ID: process.env.NETSUITE_ACCOUNT_ID,
                NETSUITE_CLIENT_ID: process.env.NETSUITE_CLIENT_ID,
                OAUTH_CALLBACK_PORT: process.env.OAUTH_CALLBACK_PORT || "9090"
            }
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
