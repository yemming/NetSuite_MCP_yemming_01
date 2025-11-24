import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "NetSuite MCP Bridge",
    description: "Connect NetSuite to MCP clients like n8n",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className="bg-gray-50 min-h-screen text-gray-900 font-sans antialiased">
                {children}
            </body>
        </html>
    );
}
