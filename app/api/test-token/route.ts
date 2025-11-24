import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Token 測試 API - 直接測試 NetSuite API 調用
 * 訪問 /api/test-token 來測試 token 是否有效
 */
export async function GET() {
    const accountId = (process.env.NETSUITE_ACCOUNT_ID || '').toLowerCase();
    
    if (!accountId) {
        return NextResponse.json({
            error: 'NETSUITE_ACCOUNT_ID 環境變量未設置'
        }, { status: 500 });
    }

    // 讀取 session 文件
    const sessionsDir = path.join(process.cwd(), 'sessions');
    const sessionFilePath = path.join(sessionsDir, `${accountId}.json`);

    if (!fs.existsSync(sessionFilePath)) {
        return NextResponse.json({
            error: 'Session 文件不存在',
            path: sessionFilePath,
            action: '請先訪問 /api/auth/login 進行授權'
        }, { status: 404 });
    }

    try {
        const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
        const sessionData = JSON.parse(sessionContent);

        if (!sessionData.tokens?.access_token) {
            return NextResponse.json({
                error: 'Session 文件中沒有 access_token'
            }, { status: 400 });
        }

        const accessToken = sessionData.tokens.access_token;
        const accountDomain = accountId.toLowerCase().replace(/_/g, '-');

        // 測試 1: 嘗試調用 NetSuite REST API
        // 使用一個簡單的端點來測試 token 是否有效
        const testUrl = `https://${accountDomain}.suitetalk.api.netsuite.com/services/rest/record/v1/metadata-catalog`;

        console.log('🧪 Testing NetSuite API with token...');
        console.log(`URL: ${testUrl}`);
        console.log(`Account: ${accountId}`);
        console.log(`Token prefix: ${accessToken.substring(0, 50)}...`);

        const response = await fetch(testUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Prefer': 'transient'
            }
        });

        const responseText = await response.text();
        let responseData: any;
        
        try {
            responseData = JSON.parse(responseText);
        } catch {
            responseData = { raw: responseText };
        }

        const result = {
            success: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            response: responseData,
            tokenInfo: {
                hasToken: !!accessToken,
                tokenLength: accessToken.length,
                tokenPrefix: accessToken.substring(0, 50) + '...',
                tokenType: sessionData.tokens.token_type || 'Bearer',
                expiresIn: sessionData.tokens.expires_in,
                accountId: sessionData.tokens.accountId || sessionData.config?.accountId
            },
            request: {
                url: testUrl,
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ***',
                    'Content-Type': 'application/json'
                }
            }
        };

        if (!response.ok) {
            // 如果是認證錯誤，提供詳細信息
            if (response.status === 401 || response.status === 403) {
                result.response = {
                    ...result.response,
                    error: 'Token 認證失敗',
                    possibleCauses: [
                        'Token 已過期（Access Token 通常 60 分鐘有效期）',
                        'Token 格式錯誤',
                        'Scope 權限不足',
                        'Account ID 不匹配',
                        'NetSuite Integration 設置問題'
                    ],
                    suggestions: [
                        '檢查 token 年齡（訪問 /api/diagnostics）',
                        '重新授權獲取新 token（訪問 /api/auth/login）',
                        '確認 NetSuite Integration 中的 Scope 設置正確',
                        '確認 Account ID 與 NetSuite 帳號匹配'
                    ]
                };
            }
        }

        return NextResponse.json(result, {
            status: response.ok ? 200 : response.status
        });

    } catch (error: any) {
        console.error('Token 測試失敗:', error);
        return NextResponse.json({
            error: '測試過程中發生錯誤',
            details: error.message,
            stack: error.stack
        }, { status: 500 });
    }
}

