const express = require('express');
const bodyParser = require('body-parser');
const spawn = require('cross-spawn');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());

// Store active sessions
const sessions = new Map();

// Configuration for NetSuite MCP
// In production (Zeabur), these should be set as environment variables
const NETSUITE_CONFIG = {
    command: 'npx',
    args: ['@suiteinsider/netsuite-mcp@latest'],
    env: {
        ...process.env,
        // Fallback defaults if env vars are missing (mainly for local dev)
        // NETSUITE_ACCOUNT_ID: process.env.NETSUITE_ACCOUNT_ID,
        // NETSUITE_CLIENT_ID: process.env.NETSUITE_CLIENT_ID,
        OAUTH_CALLBACK_PORT: process.env.OAUTH_CALLBACK_PORT || "9090"
    }
};

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// SSE Endpoint
app.get('/sse', (req, res) => {
    const sessionId = uuidv4();
    console.log(`[${sessionId}] New SSE connection`);

    // Set headers for SSE
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    });

    // Spawn NetSuite MCP process
    const mcpProcess = spawn(NETSUITE_CONFIG.command, NETSUITE_CONFIG.args, {
        env: NETSUITE_CONFIG.env
    });

    sessions.set(sessionId, { process: mcpProcess, res });

    // Send endpoint event (n8n expects this to know where to post messages)
    const endpointUrl = `/message?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

    // Handle stdout -> SSE
    mcpProcess.stdout.on('data', (data) => {
        const lines = data.toString().split('\n');
        for (const line of lines) {
            if (line.trim()) {
                // console.log(`[${sessionId}] Server -> Client: ${line}`);
                res.write(`event: message\ndata: ${line}\n\n`);
            }
        }
    });

    // Handle stderr
    mcpProcess.stderr.on('data', (data) => {
        console.error(`[${sessionId}] Error: ${data}`);
    });

    // Cleanup on close
    req.on('close', () => {
        console.log(`[${sessionId}] Connection closed`);
        mcpProcess.kill();
        sessions.delete(sessionId);
    });
});

// Message Endpoint
app.post('/message', (req, res) => {
    const sessionId = req.query.sessionId;
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(404).send('Session not found');
    }

    const session = sessions.get(sessionId);
    const message = req.body;

    // console.log(`[${sessionId}] Client -> Server: ${JSON.stringify(message)}`);

    // Write to stdin
    session.process.stdin.write(JSON.stringify(message) + '\n');

    res.status(200).send('Accepted');
});

const fs = require('fs');

// ... (imports)

// Restore session from Env Var
function restoreSession() {
    if (!process.env.NETSUITE_SESSION_JSON) {
        console.log('No NETSUITE_SESSION_JSON provided, skipping session restore.');
        return;
    }

    try {
        // Find the package path to locate sessions directory
        // We use require.resolve to find the package.json of the dependency
        const packagePath = require.resolve('@suiteinsider/netsuite-mcp/package.json');
        const packageDir = path.dirname(packagePath);
        const sessionsDir = path.join(packageDir, 'sessions');

        const sessionData = JSON.parse(process.env.NETSUITE_SESSION_JSON);
        // The filename is usually ACCOUNT_ID.json
        // The JSON structure provided by user has config.accountId
        const accountId = sessionData.config?.accountId || sessionData.accountId;

        if (!accountId) {
            console.error('Could not find accountId in NETSUITE_SESSION_JSON');
            return;
        }

        if (!fs.existsSync(sessionsDir)) {
            fs.mkdirSync(sessionsDir, { recursive: true });
        }

        const filePath = path.join(sessionsDir, `${accountId}.json`);
        fs.writeFileSync(filePath, process.env.NETSUITE_SESSION_JSON);
        console.log(`Successfully restored session for ${accountId} to ${filePath}`);

    } catch (e) {
        console.error('Error restoring session:', e);
    }
}

// Call restore before starting
restoreSession();

app.listen(PORT, () => {
    console.log(`NetSuite MCP Bridge listening on port ${PORT}`);
});
