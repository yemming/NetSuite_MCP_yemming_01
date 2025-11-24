import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * 診斷 API Endpoint
 * 訪問 /api/diagnostics 查看 session 狀態
 */
export async function GET() {
    const diagnostics: any = {
        timestamp: new Date().toISOString(),
        environment: {},
        session: {},
        recommendations: []
    };

    // 1. 檢查環境變量
    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const clientId = process.env.NETSUITE_CLIENT_ID;
    const clientSecret = process.env.NETSUITE_CLIENT_SECRET;
    const appBaseUrl = process.env.APP_BASE_URL;

    diagnostics.environment = {
        NETSUITE_ACCOUNT_ID: accountId ? {
            value: accountId,
            normalized: accountId.toLowerCase(),
            status: '✅'
        } : { status: '❌', error: '未設置' },
        
        NETSUITE_CLIENT_ID: clientId ? {
            value: clientId.substring(0, 20) + '...',
            status: '✅'
        } : { status: '❌', error: '未設置' },
        
        NETSUITE_CLIENT_SECRET: clientSecret ? {
            status: '✅ 已設置'
        } : { status: '⚠️ 未設置（Public Client 則正常）' },
        
        APP_BASE_URL: appBaseUrl ? {
            value: appBaseUrl,
            status: '✅'
        } : { status: '❌', error: '未設置' }
    };

    if (!accountId) {
        diagnostics.recommendations.push({
            level: 'error',
            message: 'NETSUITE_ACCOUNT_ID 環境變量未設置',
            action: '請在 Zeabur 環境變量中設置此值'
        });
        return NextResponse.json(diagnostics, { status: 500 });
    }

    // 2. 檢查 session 文件
    const sessionsDir = path.join(process.cwd(), 'sessions');
    const normalizedAccountId = accountId.toLowerCase();
    const sessionFilePath = path.join(sessionsDir, `${normalizedAccountId}.json`);

    diagnostics.session.directory = sessionsDir;
    diagnostics.session.normalizedAccountId = normalizedAccountId;
    diagnostics.session.expectedFile = `${normalizedAccountId}.json`;

    if (!fs.existsSync(sessionsDir)) {
        diagnostics.session.status = '❌ Sessions 目錄不存在';
        diagnostics.recommendations.push({
            level: 'error',
            message: 'Sessions 目錄不存在',
            action: `請訪問 ${appBaseUrl || 'YOUR_APP_URL'}/api/auth/login 進行授權`
        });
        return NextResponse.json(diagnostics, { status: 404 });
    }

    // 列出所有 session 文件
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    diagnostics.session.filesFound = files;

    if (!fs.existsSync(sessionFilePath)) {
        diagnostics.session.status = '❌ Session 文件不存在';
        
        // 檢查是否有大寫版本
        const upperCaseFile = `${accountId.toUpperCase()}.json`;
        if (files.includes(upperCaseFile)) {
            diagnostics.session.warning = `發現大寫版本: ${upperCaseFile}`;
            diagnostics.recommendations.push({
                level: 'warning',
                message: `發現舊的大寫 session 文件: ${upperCaseFile}`,
                action: '需要重新授權以創建正確的小寫 session 文件'
            });
        }
        
        diagnostics.recommendations.push({
            level: 'error',
            message: 'Session 文件不存在',
            action: `請訪問 ${appBaseUrl || 'YOUR_APP_URL'}/api/auth/login 進行授權`
        });
        
        return NextResponse.json(diagnostics, { status: 404 });
    }

    // 3. 分析 session 文件內容
    try {
        const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
        const sessionData = JSON.parse(sessionContent);

        diagnostics.session.status = '✅ Session 文件存在';
        diagnostics.session.authenticated = sessionData.authenticated;
        diagnostics.session.config = {
            accountId: sessionData.config?.accountId,
            clientId: sessionData.config?.clientId?.substring(0, 20) + '...',
            redirectUri: sessionData.config?.redirectUri
        };

        // Token 分析
        if (sessionData.tokens) {
            const hasAccessToken = !!sessionData.tokens.access_token;
            const hasRefreshToken = !!sessionData.tokens.refresh_token;
            
            diagnostics.session.tokens = {
                hasAccessToken,
                hasRefreshToken,
                tokenType: sessionData.tokens.token_type,
                expiresIn: sessionData.tokens.expires_in
            };

            // Token 年齡
            if (sessionData.timestamp) {
                const tokenTime = sessionData.timestamp;
                const now = Date.now();
                const ageInMinutes = Math.round((now - tokenTime) / 60000);
                
                diagnostics.session.tokens.createdAt = new Date(tokenTime).toISOString();
                diagnostics.session.tokens.ageMinutes = ageInMinutes;
                
                if (ageInMinutes > 55) {
                    diagnostics.session.tokens.status = '⚠️ Token 可能已過期';
                    diagnostics.recommendations.push({
                        level: 'warning',
                        message: `Access Token 已使用 ${ageInMinutes} 分鐘（通常 60 分鐘過期）`,
                        action: hasRefreshToken 
                            ? 'MCP Server 應該會自動使用 Refresh Token 更新' 
                            : '需要重新授權'
                    });
                } else {
                    diagnostics.session.tokens.status = '✅ Token 仍在有效期內';
                }
            }

            if (!hasRefreshToken) {
                diagnostics.recommendations.push({
                    level: 'warning',
                    message: '缺少 Refresh Token',
                    action: '確認 NetSuite Integration 中啟用了 "Authorization Code Grant"'
                });
            }

            // Account ID 一致性檢查
            if (sessionData.config?.accountId !== normalizedAccountId) {
                diagnostics.recommendations.push({
                    level: 'error',
                    message: `Session 中的 Account ID (${sessionData.config?.accountId}) 與環境變量不匹配`,
                    action: '需要重新授權以創建正確的 session'
                });
            }
        } else {
            diagnostics.session.tokens = {
                status: '❌ 無 token 數據'
            };
            diagnostics.recommendations.push({
                level: 'error',
                message: 'Session 文件中缺少 tokens 對象',
                action: '需要重新授權'
            });
        }

    } catch (e: any) {
        diagnostics.session.status = '❌ Session 文件讀取失敗';
        diagnostics.session.error = e.message;
        diagnostics.recommendations.push({
            level: 'error',
            message: 'Session 文件格式錯誤或損壞',
            action: '需要重新授權'
        });
    }

    // 4. 總結
    const hasErrors = diagnostics.recommendations.some((r: any) => r.level === 'error');
    const hasWarnings = diagnostics.recommendations.some((r: any) => r.level === 'warning');
    
    diagnostics.summary = {
        status: hasErrors ? '❌ 有錯誤' : hasWarnings ? '⚠️ 有警告' : '✅ 正常',
        errors: diagnostics.recommendations.filter((r: any) => r.level === 'error').length,
        warnings: diagnostics.recommendations.filter((r: any) => r.level === 'warning').length
    };

    return NextResponse.json(diagnostics, { 
        status: hasErrors ? 500 : 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8'
        }
    });
}

