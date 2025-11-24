'use client';

import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react';

export default function Home() {
    const [status, setStatus] = useState<'loading' | 'connected' | 'disconnected'>('loading');
    const [accountId, setAccountId] = useState('');

    useEffect(() => {
        // Check connection status on load
        fetch('/api/auth/status')
            .then(res => res.json())
            .then(data => {
                setStatus(data.connected ? 'connected' : 'disconnected');
                if (data.accountId) setAccountId(data.accountId);
            })
            .catch(() => setStatus('disconnected'));
    }, []);

    const handleConnect = () => {
        window.location.href = '/api/auth/login';
    };

    return (
        <main className="flex min-h-screen flex-col items-center justify-center p-24">
            <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
                <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto  lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
                    NetSuite MCP Bridge
                </p>
            </div>

            <div className="relative flex place-items-center before:absolute before:h-[300px] before:w-[480px] before:-translate-x-1/2 before:rounded-full before:bg-gradient-to-br before:from-transparent before:to-blue-700 before:opacity-10 before:blur-2xl before:content-[''] after:absolute after:-z-20 after:h-[180px] after:w-[240px] after:translate-x-1/3 after:bg-gradient-to-t after:from-blue-900 after:via-blue-800 after:opacity-40 after:blur-2xl after:content-[''] before:dark:bg-gradient-to-br before:dark:from-transparent before:dark:to-blue-700 before:dark:opacity-10 after:dark:from-blue-900 after:dark:via-[#0141ff] after:dark:opacity-40 before:lg:h-[360px]">
                <div className="flex flex-col items-center gap-8">
                    <h1 className="text-4xl font-bold text-center mb-4">
                        Connect your NetSuite Account
                    </h1>

                    <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-gray-100 w-full max-w-md flex flex-col items-center gap-6">
                        {status === 'loading' ? (
                            <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                        ) : status === 'connected' ? (
                            <>
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                                    <ShieldCheck className="w-10 h-10 text-green-600" />
                                </div>
                                <div className="text-center">
                                    <h2 className="text-xl font-semibold text-green-700">Connected</h2>
                                    <p className="text-gray-500 mt-2">Account ID: {accountId}</p>
                                    <p className="text-sm text-gray-400 mt-4">Your MCP Bridge is ready to use.</p>
                                </div>
                                <button
                                    onClick={handleConnect}
                                    className="px-6 py-2 text-sm text-gray-500 hover:text-gray-700 underline"
                                >
                                    Reconnect
                                </button>
                            </>
                        ) : (
                            <>
                                <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                                    <ShieldAlert className="w-10 h-10 text-gray-400" />
                                </div>
                                <div className="text-center">
                                    <h2 className="text-xl font-semibold text-gray-700">Not Connected</h2>
                                    <p className="text-gray-500 mt-2">Connect to enable MCP access.</p>
                                </div>
                                <button
                                    onClick={handleConnect}
                                    className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-600/20"
                                >
                                    Connect NetSuite
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="mb-32 grid text-center lg:max-w-5xl lg:w-full lg:mb-0 lg:grid-cols-3 lg:text-left mt-20">
                <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
                    <h2 className={`mb-3 text-2xl font-semibold`}>
                        Secure{' '}
                        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                            -&gt;
                        </span>
                    </h2>
                    <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
                        OAuth 2.0 authentication with secure token storage.
                    </p>
                </div>

                <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
                    <h2 className={`mb-3 text-2xl font-semibold`}>
                        MCP Ready{' '}
                        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                            -&gt;
                        </span>
                    </h2>
                    <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
                        Compatible with n8n and other MCP clients via SSE.
                    </p>
                </div>

                <div className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30">
                    <h2 className={`mb-3 text-2xl font-semibold`}>
                        Zeabur{' '}
                        <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                            -&gt;
                        </span>
                    </h2>
                    <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
                        Optimized for serverless deployment on Zeabur.
                    </p>
                </div>
            </div>
        </main>
    );
}
