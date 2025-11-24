import { NextRequest } from 'next/server';
import { spawn, execSync } from 'child_process';
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
                
                // Check token age
                const tokenTime = sessionData.timestamp || 0;
                const now = Date.now();
                const ageInMinutes = Math.round((now - tokenTime) / 60000);
                
                console.log(`[${sessionId}] 🔍 Session Analysis:`);
                console.log(`[${sessionId}] - File: ${sessionFilePath}`);
                console.log(`[${sessionId}] - Account: ${sessionData.config?.accountId}`);
                console.log(`[${sessionId}] - Token Age: ${ageInMinutes} minutes`);
                console.log(`[${sessionId}] - Has Access Token: ${!!sessionData.tokens?.access_token}`);
                console.log(`[${sessionId}] - Has Refresh Token: ${!!sessionData.tokens?.refresh_token}`);
                
                if (ageInMinutes > 55) {
                    console.warn(`[${sessionId}] ⚠️ WARNING: Access Token might be expired (>55 mins). MCP Server relies on Refresh Token.`);
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
        const mcpEnv: NodeJS.ProcessEnv = {
            ...process.env,
            NETSUITE_ACCOUNT_ID: process.env.NETSUITE_ACCOUNT_ID || '',
            NETSUITE_CLIENT_ID: process.env.NETSUITE_CLIENT_ID || '',
            NETSUITE_CLIENT_SECRET: process.env.NETSUITE_CLIENT_SECRET || '',
            OAUTH_CALLBACK_PORT: process.env.OAUTH_CALLBACK_PORT || "9090",
        };
        
        // Inject tokens via environment variables (Backup strategy)
        if (sessionData?.tokens) {
            if (sessionData.tokens.access_token) {
                mcpEnv.NETSUITE_ACCESS_TOKEN = sessionData.tokens.access_token;
            }
            if (sessionData.tokens.refresh_token) {
                mcpEnv.NETSUITE_REFRESH_TOKEN = sessionData.tokens.refresh_token;
            }
        }
        
        // --- CRITICAL FIX: Direct Node Execution with Session Pre-seeding ---
        
        // 1. Determine MCP package location
        // In Next.js standalone (Docker), we explicitly copied node_modules/@suiteinsider
        // to the root node_modules. So we can access it directly.
        const mcpPackagePath = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp');
        // Use 'dist/index.js' if it exists (compiled), otherwise 'src/index.js'
        // Based on npm view, main is src/index.js, but installed package usually has dist/ or build/
        // Let's check for dist first, then src
        let mcpScriptPath = path.join(mcpPackagePath, 'dist', 'index.js');
        if (!fs.existsSync(mcpScriptPath)) {
            mcpScriptPath = path.join(mcpPackagePath, 'src', 'index.js');
        }
        // Fallback to index.js in root if neither exists
        if (!fs.existsSync(mcpScriptPath)) {
             mcpScriptPath = path.join(mcpPackagePath, 'index.js');
        }

        const mcpSessionsDir = path.join(mcpPackagePath, 'sessions');

        console.log(`[${sessionId}] 🛠️ Setup:`);
        console.log(`[${sessionId}] - MCP Package Path: ${mcpPackagePath}`);
        console.log(`[${sessionId}] - MCP Script Path: ${mcpScriptPath}`);
        console.log(`[${sessionId}] - Target Sessions Dir: ${mcpSessionsDir}`);

        // 2. Ensure MCP sessions directory exists
        if (!fs.existsSync(mcpSessionsDir)) {
             try {
                fs.mkdirSync(mcpSessionsDir, { recursive: true });
             } catch (e) {
                console.error(`[${sessionId}] Failed to create MCP sessions dir:`, e);
             }
        }

        // 3. Force copy session file to MCP location BEFORE starting
        if (sessionData && fs.existsSync(sessionFilePath)) {
            try {
                const mcpSessionPath = path.join(mcpSessionsDir, `${accountId}.json`);
                fs.writeFileSync(mcpSessionPath, fs.readFileSync(sessionFilePath));
                console.log(`[${sessionId}] ✅ Enforced session copy to: ${mcpSessionPath}`);
            } catch (e) {
                console.error(`[${sessionId}] Failed to copy session file:`, e);
            }
        }

        // 4. Start process using node directly (Bypass npx)
        console.log(`[${sessionId}] 🚀 Spawning MCP Server...`);
        
        mcpProcess = spawn('node', [mcpScriptPath], {
            env: mcpEnv,
            cwd: process.cwd() 
        });


        // Store session
        sessions.set(sessionId, { process: mcpProcess, writer });

        // Send endpoint event immediately
        // The endpoint URL where n8n should POST messages
        // We point back to THIS same route, but with POST method (handled below)
        // We append sessionId as query param
        const endpointUrl = `/api/sse?sessionId=${sessionId}`;

        // Track if we've copied the session file and initialized auth
        let sessionCopied = false;
        let authInitialized = false;

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

            mcpProcess.stderr.on('data', async (data: Buffer) => {
                const output = data.toString();
                console.error(`[${sessionId}] MCP Log: ${output.trim()}`);
                
                // Detect Authentication Required state
                if (output.includes('authentication required') || output.includes('Not authenticated')) {
                     const loginUrl = `${process.env.APP_BASE_URL || 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN || 'YOUR_APP_URL'}/api/auth/login`;
                     const authWarning = `
                     
********************************************************************************
🚨 AUTHENTICATION REQUIRED 🚨
The MCP Server needs a fresh session.
Please visit this URL in your browser to authenticate:

👉 ${loginUrl}

After authenticating, the session file will be updated and you can retry the connection.
********************************************************************************
`;
                     console.error(authWarning);
                     // We can also try to send this as a 'message' event to n8n so it shows up in the frontend logs?
                     // Probably better to just keep it in server logs for now.
                }
                
                // Parse MCP server output to find sessions directory
                // Look for pattern: "📁 Sessions Directory: /path/to/sessions"
                // Copy session file to MCP's sessions directory so it can be found on startup
                if (!sessionCopied && sessionData && fs.existsSync(sessionFilePath)) {
                    const sessionsDirMatch = output.match(/📁 Sessions Directory: (.+)/);
                    if (sessionsDirMatch && sessionsDirMatch[1]) {
                        const mcpSessionsDir = sessionsDirMatch[1].trim();
                        try {
                            // Ensure the directory exists
                            if (!fs.existsSync(mcpSessionsDir)) {
                                fs.mkdirSync(mcpSessionsDir, { recursive: true });
                            }
                            
                            // Copy session file to MCP's sessions directory
                            const mcpSessionPath = path.join(mcpSessionsDir, `${accountId}.json`);
                            const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
                            fs.writeFileSync(mcpSessionPath, sessionContent);
                            console.log(`[${sessionId}] ✅ Session file copied to MCP location: ${mcpSessionPath}`);
                            sessionCopied = true;
                        } catch (e) {
                            console.error(`[${sessionId}] Failed to copy session to MCP location:`, e);
                        }
                    }
                }
                
                // When MCP server is ready, if we have session data, try to initialize auth
                // by directly writing tokens to the session file again (force reload)
                if (!authInitialized && sessionCopied && sessionData && output.includes('NetSuite MCP Server ready!')) {
                    setTimeout(() => {
                        try {
                            // Re-write the session file to trigger MCP server to reload it
                            // This is a workaround for MCP server not detecting the session file on startup
                            const sessionsDirMatch = output.match(/📁 Sessions Directory: (.+)/);
                            if (sessionsDirMatch && sessionsDirMatch[1]) {
                                const mcpSessionsDir = sessionsDirMatch[1].trim();
                                const mcpSessionPath = path.join(mcpSessionsDir, `${accountId}.json`);
                                
                                // Ensure the session file exists and has correct format
                                if (fs.existsSync(mcpSessionPath)) {
                                    // Re-write to ensure it's fresh
                                    const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
                                    fs.writeFileSync(mcpSessionPath, sessionContent);
                                    console.log(`[${sessionId}] ✅ Re-wrote session file to trigger reload: ${mcpSessionPath}`);
                                    
                                    // Log session file contents for debugging
                                    const sessionFileContent = fs.readFileSync(mcpSessionPath, 'utf-8');
                                    const parsed = JSON.parse(sessionFileContent);
                                    console.log(`[${sessionId}] Session file contains:`, {
                                        hasTokens: !!parsed.tokens,
                                        hasAccessToken: !!parsed.tokens?.access_token,
                                        hasRefreshToken: !!parsed.tokens?.refresh_token,
                                        authenticated: parsed.authenticated
                                    });
                                }
                            }
                            authInitialized = true;
                        } catch (e) {
                            console.error(`[${sessionId}] Failed to initialize auth:`, e);
                        }
                    }, 500);
                }
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
