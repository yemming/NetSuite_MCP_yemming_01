#!/usr/bin/env node
/**
 * NetSuite Session Diagnostics Tool
 * 檢查 session 文件狀態、token 有效期和配置問題
 */

const fs = require('fs');
const path = require('path');

function checkSession() {
    console.log('🔍 NetSuite Session 診斷工具\n');
    
    // 檢查環境變量
    console.log('📋 環境變量檢查:');
    const accountId = process.env.NETSUITE_ACCOUNT_ID;
    const clientId = process.env.NETSUITE_CLIENT_ID;
    const clientSecret = process.env.NETSUITE_CLIENT_SECRET;
    const appBaseUrl = process.env.APP_BASE_URL;
    
    console.log(`  NETSUITE_ACCOUNT_ID: ${accountId ? '✅ ' + accountId : '❌ 未設置'}`);
    console.log(`  NETSUITE_CLIENT_ID: ${clientId ? '✅ ' + clientId.substring(0, 20) + '...' : '❌ 未設置'}`);
    console.log(`  NETSUITE_CLIENT_SECRET: ${clientSecret ? '✅ 已設置' : '⚠️  未設置 (如果是 Public Client 則正常)'}`);
    console.log(`  APP_BASE_URL: ${appBaseUrl ? '✅ ' + appBaseUrl : '❌ 未設置'}`);
    console.log('');
    
    if (!accountId) {
        console.log('❌ 錯誤: NETSUITE_ACCOUNT_ID 未設置！');
        console.log('請在 .env 或環境變量中設置此值\n');
        return;
    }
    
    // 檢查 session 文件
    console.log('📂 Session 文件檢查:');
    const sessionsDir = path.join(process.cwd(), 'sessions');
    const normalizedAccountId = accountId.toLowerCase();
    
    console.log(`  Sessions 目錄: ${sessionsDir}`);
    console.log(`  標準化 Account ID: ${normalizedAccountId}`);
    
    if (!fs.existsSync(sessionsDir)) {
        console.log(`  ❌ Sessions 目錄不存在: ${sessionsDir}`);
        console.log('  請先執行 OAuth 授權流程：訪問 /api/auth/login\n');
        return;
    }
    
    // 列出所有 session 文件
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    console.log(`  找到 ${files.length} 個 session 文件: ${files.join(', ')}`);
    console.log('');
    
    // 檢查正確的 session 文件
    const sessionFilePath = path.join(sessionsDir, `${normalizedAccountId}.json`);
    
    if (!fs.existsSync(sessionFilePath)) {
        console.log(`  ❌ 找不到對應的 session 文件: ${normalizedAccountId}.json`);
        
        // 檢查是否有大寫版本
        const upperCaseFile = path.join(sessionsDir, `${accountId.toUpperCase()}.json`);
        if (fs.existsSync(upperCaseFile)) {
            console.log(`  ⚠️  發現大寫版本: ${accountId.toUpperCase()}.json`);
            console.log(`  正在轉換為小寫版本...`);
            
            try {
                const content = fs.readFileSync(upperCaseFile, 'utf-8');
                const sessionData = JSON.parse(content);
                
                // 更新 Account ID 為小寫
                if (sessionData.config) {
                    sessionData.config.accountId = normalizedAccountId;
                }
                if (sessionData.tokens) {
                    sessionData.tokens.accountId = normalizedAccountId;
                }
                
                // 保存為小寫文件名
                fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
                console.log(`  ✅ 已創建小寫版本: ${normalizedAccountId}.json`);
                
                // 刪除舊的大寫文件
                fs.unlinkSync(upperCaseFile);
                console.log(`  🗑️  已刪除舊文件: ${accountId.toUpperCase()}.json\n`);
            } catch (e) {
                console.error(`  ❌ 轉換失敗:`, e.message);
                return;
            }
        } else {
            console.log(`  請先執行 OAuth 授權流程：訪問 ${appBaseUrl || 'YOUR_APP_URL'}/api/auth/login\n`);
            return;
        }
    }
    
    // 讀取並分析 session 文件
    try {
        const sessionContent = fs.readFileSync(sessionFilePath, 'utf-8');
        const sessionData = JSON.parse(sessionContent);
        
        console.log('✅ Session 文件內容分析:');
        console.log(`  認證狀態: ${sessionData.authenticated ? '✅ 已認證' : '❌ 未認證'}`);
        console.log(`  Account ID: ${sessionData.config?.accountId || 'N/A'}`);
        console.log(`  Client ID: ${sessionData.config?.clientId ? sessionData.config.clientId.substring(0, 20) + '...' : 'N/A'}`);
        console.log(`  Redirect URI: ${sessionData.config?.redirectUri || 'N/A'}`);
        console.log('');
        
        // 檢查 tokens
        if (sessionData.tokens) {
            const hasAccessToken = !!sessionData.tokens.access_token;
            const hasRefreshToken = !!sessionData.tokens.refresh_token;
            const tokenType = sessionData.tokens.token_type || 'N/A';
            const expiresIn = sessionData.tokens.expires_in;
            
            console.log('🔑 Token 狀態:');
            console.log(`  Access Token: ${hasAccessToken ? '✅ 存在' : '❌ 不存在'}`);
            console.log(`  Refresh Token: ${hasRefreshToken ? '✅ 存在' : '❌ 不存在'}`);
            console.log(`  Token Type: ${tokenType}`);
            console.log(`  Expires In: ${expiresIn ? expiresIn + ' 秒 (~' + Math.round(expiresIn/60) + ' 分鐘)' : 'N/A'}`);
            console.log('');
            
            // 檢查 token 年齡
            if (sessionData.timestamp) {
                const tokenTime = sessionData.timestamp;
                const now = Date.now();
                const ageInMinutes = Math.round((now - tokenTime) / 60000);
                const ageInHours = (ageInMinutes / 60).toFixed(1);
                
                console.log('⏰ Token 年齡:');
                console.log(`  創建時間: ${new Date(tokenTime).toLocaleString('zh-TW')}`);
                console.log(`  已使用時長: ${ageInMinutes} 分鐘 (${ageInHours} 小時)`);
                
                if (ageInMinutes > 55) {
                    console.log(`  ⚠️  警告: Access Token 可能已過期 (通常 60 分鐘有效期)`);
                    if (hasRefreshToken) {
                        console.log(`  💡 建議: MCP Server 應該會自動使用 Refresh Token 更新`);
                    } else {
                        console.log(`  ❌ 錯誤: 沒有 Refresh Token，需要重新授權`);
                    }
                } else {
                    console.log(`  ✅ Token 仍在有效期內`);
                }
            }
            console.log('');
            
            // 提供建議
            console.log('💡 建議:');
            if (!hasRefreshToken) {
                console.log(`  ⚠️  缺少 Refresh Token - 請確認 OAuth 設置是否正確`);
                console.log(`     NetSuite Integration 需要啟用 "Authorization Code Grant" 才會返回 Refresh Token`);
            }
            if (sessionData.config?.accountId !== normalizedAccountId) {
                console.log(`  ⚠️  Session 中的 Account ID (${sessionData.config?.accountId}) 與環境變量不匹配`);
                console.log(`     正在修正...`);
                
                sessionData.config.accountId = normalizedAccountId;
                if (sessionData.tokens) {
                    sessionData.tokens.accountId = normalizedAccountId;
                }
                fs.writeFileSync(sessionFilePath, JSON.stringify(sessionData, null, 2));
                console.log(`  ✅ 已修正 Account ID`);
            }
        } else {
            console.log('❌ 錯誤: Session 文件中沒有 tokens 對象');
            console.log('   請重新執行 OAuth 授權流程\n');
        }
        
        // 檢查 MCP 目錄中的 session
        console.log('📦 MCP Package Session 檢查:');
        const mcpSessionsDir = path.join(process.cwd(), 'node_modules', '@suiteinsider', 'netsuite-mcp', 'sessions');
        if (fs.existsSync(mcpSessionsDir)) {
            const mcpSessionPath = path.join(mcpSessionsDir, `${normalizedAccountId}.json`);
            if (fs.existsSync(mcpSessionPath)) {
                console.log(`  ✅ MCP session 文件存在: ${mcpSessionPath}`);
            } else {
                console.log(`  ⚠️  MCP session 文件不存在，正在複製...`);
                try {
                    fs.writeFileSync(mcpSessionPath, sessionContent);
                    console.log(`  ✅ 已複製 session 到 MCP 目錄`);
                } catch (e) {
                    console.error(`  ❌ 複製失敗:`, e.message);
                }
            }
        } else {
            console.log(`  ℹ️  MCP sessions 目錄不存在 (使用 npx 時正常)`);
        }
        
    } catch (e) {
        console.error('❌ 讀取 session 文件失敗:', e.message);
        return;
    }
    
    console.log('\n✅ 診斷完成！');
    console.log('\n如果仍有問題，請嘗試:');
    console.log(`  1. 重新授權: 訪問 ${appBaseUrl || 'YOUR_APP_URL'}/api/auth/login`);
    console.log(`  2. 重啟 MCP Server`);
    console.log(`  3. 檢查 NetSuite Integration 設置中的 Scope 和 Grant Type`);
}

checkSession();

