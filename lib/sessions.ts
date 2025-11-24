// In-memory session store
// Note: This only works if the Next.js server is running as a single process (e.g. `next start`).
// If deployed on Vercel (Serverless), this will NOT work because state is not shared between requests.
// On Zeabur (Docker), it runs as a long-lived process, so this is fine.

export const sessions = new Map<string, { process: any; writer: WritableStreamDefaultWriter<any> }>();
