import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * 清理 API - 刪除所有舊的 session 文件
 * 訪問 /api/auth/cleanup 來清理
 */
export async function POST() {
    const sessionsDir = path.join(process.cwd(), 'sessions');
    
    if (!fs.existsSync(sessionsDir)) {
        return NextResponse.json({ 
            message: 'Sessions 目錄不存在，無需清理',
            status: 'ok'
        });
    }

    try {
        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
        const deleted: string[] = [];
        
        for (const file of files) {
            const filePath = path.join(sessionsDir, file);
            
            // 檢查是否為大寫開頭的文件（舊格式）
            if (/^[A-Z]/.test(file)) {
                fs.unlinkSync(filePath);
                deleted.push(file);
                console.log(`🗑️  已刪除舊 session 文件: ${file}`);
            } else {
                // 即使是小寫，也檢查內容
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const sessionData = JSON.parse(content);
                    
                    // 如果內容中的 accountId 是大寫，也刪除
                    if (sessionData.config?.accountId && 
                        sessionData.config.accountId !== sessionData.config.accountId.toLowerCase()) {
                        fs.unlinkSync(filePath);
                        deleted.push(file);
                        console.log(`🗑️  已刪除內容大寫的 session 文件: ${file}`);
                    }
                } catch (e) {
                    // 如果解析失敗，說明文件已損壞，也刪除
                    fs.unlinkSync(filePath);
                    deleted.push(file);
                    console.log(`🗑️  已刪除損壞的 session 文件: ${file}`);
                }
            }
        }

        // 也清理 MCP package 中的舊 session
        try {
            const mcpSessionsDir = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp', 'sessions');
            if (fs.existsSync(mcpSessionsDir)) {
                const mcpFiles = fs.readdirSync(mcpSessionsDir).filter(f => f.endsWith('.json'));
                for (const file of mcpFiles) {
                    const filePath = path.join(mcpSessionsDir, file);
                    fs.unlinkSync(filePath);
                    deleted.push(`mcp/${file}`);
                    console.log(`🗑️  已刪除 MCP session 文件: ${file}`);
                }
            }
        } catch (e) {
            console.log('⚠️  無法清理 MCP sessions 目錄（這是正常的）');
        }

        if (deleted.length === 0) {
            return NextResponse.json({
                message: '沒有找到需要清理的舊 session 文件',
                status: 'ok',
                filesDeleted: []
            });
        }

        return NextResponse.json({
            message: `成功清理 ${deleted.length} 個舊 session 文件`,
            status: 'success',
            filesDeleted: deleted,
            nextStep: '請訪問 /api/auth/login 重新授權'
        });

    } catch (error: any) {
        console.error('清理失敗:', error);
        return NextResponse.json({
            error: '清理失敗',
            details: error.message
        }, { status: 500 });
    }
}

// 也支持 GET 請求（方便在瀏覽器測試）
export async function GET() {
    return NextResponse.json({
        message: '請使用 POST 方法來清理 session 文件',
        usage: 'curl -X POST https://your-app-url/api/auth/cleanup',
        warning: '此操作會刪除所有現有的 session 文件，需要重新授權'
    });
}

