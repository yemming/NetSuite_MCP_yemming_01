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
            // Ensure Account ID is passed as lowercase to environment variable
            // NetSuite API endpoints are typically lowercase (e.g. td3018275.suitetalk.api.netsuite.com)
            // MCP server might be using this to construct URLs or keys
            NETSUITE_ACCOUNT_ID: (process.env.NETSUITE_ACCOUNT_ID || '').toLowerCase(),
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
            // Force authentication state if possible via env (hypothetical but helpful)
            mcpEnv.MCP_AUTHENTICATED = "true";
            
            // CRITICAL FIX: Force account ID in environment variable to be lowercase
            // This ensures it matches the filename we are about to create
            mcpEnv.NETSUITE_ACCOUNT_ID = (mcpEnv.NETSUITE_ACCOUNT_ID || '').toLowerCase();
            
            // CRITICAL FIX: Force Session Data Account ID to be lowercase
            // We are creating a new object to avoid mutating the original sessionData if we need it later
            sessionData = {
                ...sessionData,
                config: {
                    ...sessionData.config,
                    accountId: (sessionData.config?.accountId || '').toLowerCase()
                },
                tokens: {
                    ...sessionData.tokens,
                    accountId: (sessionData.tokens?.accountId || '').toLowerCase()
                }
            };
            console.log(`[${sessionId}] 🛠️ Forced Account ID to lowercase in Session Data: ${sessionData.config.accountId}`);
        }
        
        // Log the environment variables (masking secrets) to debug
        console.log(`[${sessionId}] 🛡️ Auth Injection:`);
        console.log(`[${sessionId}] - Access Token Injected: ${!!mcpEnv.NETSUITE_ACCESS_TOKEN}`);
        console.log(`[${sessionId}] - Refresh Token Injected: ${!!mcpEnv.NETSUITE_REFRESH_TOKEN}`);
        console.log(`[${sessionId}] - Account ID (Env): ${mcpEnv.NETSUITE_ACCOUNT_ID}`);

        // --- CRITICAL FIX: Use standard node_modules executable path ---
        
        // In Next.js Docker standalone build, node_modules are flattened.
        // We can rely on the binary symlinked in .bin/netsuite-mcp
        // OR find the package directly.
        
        // But since Turbopack hates dynamic paths, we will try to use 'npx' again 
        // BUT with a twist: we know the package is installed.
        // However, npx might still try to download.
        
        // Safer bet: Use the absolute path relative to CWD, but constructed in a way
        // that doesn't look like a static import to Turbopack.
        
        // We will use the standard 'node_modules/.bin/netsuite-mcp' if available,
        // otherwise fall back to constructing the path to index.js
        
        const binPath = path.join(process.cwd(), 'node_modules', '.bin', 'netsuite-mcp');
        const pkgPath = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp');
        
        let executable = 'node';
        let args: string[] = [];
        
        if (fs.existsSync(binPath)) {
             console.log(`[${sessionId}] 🚀 Using bin path: ${binPath}`);
             executable = binPath;
        } else {
             // Fallback to finding index.js
             // We construct these paths at runtime so Turbopack doesn't try to bundle them
             const possiblePaths = [
                 path.join(pkgPath, 'dist', 'index.js'),
                 path.join(pkgPath, 'src', 'index.js'),
                 path.join(pkgPath, 'index.js')
             ];
             
             const scriptPath = possiblePaths.find(p => fs.existsSync(p));
             
             if (scriptPath) {
                 console.log(`[${sessionId}] 🚀 Using script path: ${scriptPath}`);
                 args = [scriptPath];
             } else {
                 console.warn(`[${sessionId}] ⚠️ Could not find netsuite-mcp executable or script. Falling back to npx.`);
                 executable = 'npx';
                 args = ['@suiteinsider/netsuite-mcp@latest'];
             }
        }
        
        // 2. Ensure MCP sessions directory exists (if we found the package)
        // If we are using npx, we can't pre-seed easily, but if we found the package, we can.
        if (executable !== 'npx') {
            const mcpSessionsDir = path.join(pkgPath, 'sessions');
            if (!fs.existsSync(mcpSessionsDir)) {
                try {
                    fs.mkdirSync(mcpSessionsDir, { recursive: true });
                } catch (e) {
                     // Ignore creation errors
                }
            }
            
            if (sessionData && fs.existsSync(sessionFilePath)) {
                try {
                    const mcpSessionPath = path.join(mcpSessionsDir, `${accountId}.json`);
                    fs.writeFileSync(mcpSessionPath, fs.readFileSync(sessionFilePath));
                    console.log(`[${sessionId}] ✅ Enforced session copy to: ${mcpSessionPath}`);
                } catch (e) {
                    console.error(`[${sessionId}] Failed to copy session file:`, e);
                }
            }
        }

        // 4. Start process
        console.log(`[${sessionId}] 🚀 Spawning MCP Server: ${executable} ${args.join(' ')}`);
        
        mcpProcess = spawn(executable, args, {
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
