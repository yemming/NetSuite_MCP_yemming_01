# 🔍 NetSuite MCP 需求檢查清單

## 立即檢查：你是否滿足所有前提條件？

### ✅ Checklist 1: NetSuite AI Connector SuiteApp

**這是最關鍵的前提條件！**

- [ ] 已安裝 **NetSuite AI Connector SuiteApp** (Bundle ID: 522506)
- [ ] SuiteApp 狀態為 "Installed"
- [ ] SuiteApp 已完成初始配置

**如何檢查：**
1. 登入 NetSuite
2. 前往：Customization > SuiteBundler > Search & Install Bundles
3. 點擊 "List" 標籤
4. 搜索 "NetSuite AI Connector" 或 "522506"

**❌ 如果找不到 → 這就是你的問題！需要先安裝。**

---

### ✅ Checklist 2: OAuth Integration 設置

- [ ] 已創建 OAuth 2.0 Integration 記錄
- [ ] **Authorization Code Grant**: 已勾選
- [ ] **Public Client**: 已勾選（不使用 Client Secret）
- [ ] **Redirect URI**: 設置為你的應用 URL + `/api/callback`
- [ ] **Scope**: 可以看到並勾選了 "MCP" 選項

**如何檢查：**
1. 前往：Setup > Integration > Manage Integrations
2. 找到你的 Integration 記錄
3. 檢查上述設置

**⚠️ 如果看不到 "MCP" scope → SuiteApp 沒有正確安裝。**

---

### ✅ Checklist 3: Zeabur 環境變量

當前必需的環境變量：

```bash
NETSUITE_ACCOUNT_ID=td3018275                    # 小寫
NETSUITE_CLIENT_ID=你的ClientID                  # 從 Integration 複製
NETSUITE_SCOPE=mcp                               # 必須是 'mcp'
APP_BASE_URL=https://你的zeabur網址.zeabur.app
```

**如何檢查：**
1. 打開 Zeabur 控制台
2. 進入你的服務
3. 查看 Environment Variables
4. 確認所有變量都已設置且值正確

---

### ✅ Checklist 4: OAuth 流程

- [ ] Redirect URI 在 NetSuite 和 Zeabur 中完全一致
- [ ] 授權時使用的 scope 是 'mcp'
- [ ] 已清理舊的 session 文件
- [ ] 重新執行完整的 OAuth 流程

---

## 🚨 最可能的問題

根據你的情況，99% 的可能性是：

### 問題 1: 沒有安裝 NetSuite AI Connector SuiteApp

**症狀：**
- ✅ OAuth 授權成功
- ✅ 獲得了 Access Token 和 Refresh Token
- ❌ 但調用 MCP tools 時失敗
- ❌ 錯誤：Authentication failed

**原因：**
- 沒有 AI Connector SuiteApp，就沒有 MCP 功能
- 即使有 token，也無法訪問 MCP API

**解決方案：**
1. 安裝 NetSuite AI Connector SuiteApp (Bundle ID: 522506)
2. 重新創建 Integration 記錄（會出現 MCP scope）
3. 清理舊 session 並重新授權

---

### 問題 2: Scope 不正確

**症狀：**
- OAuth 授權可能成功或失敗
- Token 的 scope 不是 'mcp'

**原因：**
- Integration 中沒有勾選 MCP scope
- 或環境變量設置錯誤

**解決方案：**
1. 確認 Integration 中勾選了 MCP scope
2. 設置 `NETSUITE_SCOPE=mcp` 環境變量
3. 重新授權

---

## 📝 行動計劃

### 立即執行（按順序）：

#### Phase 1: 確認前提條件（最重要！）

1. **檢查 NetSuite AI Connector SuiteApp**
   - 登入 NetSuite
   - 檢查是否已安裝 Bundle ID: 522506
   - 如果沒有 → **立即安裝**

2. **檢查 Integration 設置**
   - 查看是否有 MCP scope 選項
   - 如果沒有 → 重新安裝 SuiteApp

#### Phase 2: 配置環境

3. **更新 Zeabur 環境變量**
   ```bash
   NETSUITE_SCOPE=mcp
   ```

4. **確認 Redirect URI**
   - NetSuite: `https://你的zeabur網址.zeabur.app/api/callback`
   - Zeabur: `APP_BASE_URL=https://你的zeabur網址.zeabur.app`

#### Phase 3: 重新授權

5. **清理舊 session**
   ```bash
   curl -X POST https://你的zeabur網址.zeabur.app/api/auth/cleanup
   ```

6. **重新授權**
   ```
   https://你的zeabur網址.zeabur.app/api/auth/login
   ```

7. **驗證結果**
   - 查看 Zeabur Logs
   - 訪問 `/api/diagnostics`
   - 訪問 `/api/test-token`
   - 在 N8N 測試 `List Tools`

---

## 💡 如何聯繫 NetSuite 支持

如果你無法自行安裝 AI Connector SuiteApp，可以：

1. **聯繫你的 NetSuite 管理員**
   - 需要管理員權限才能安裝 SuiteApp

2. **聯繫 NetSuite 支持**
   - 說明你需要安裝 "NetSuite AI Connector SuiteApp"
   - Bundle ID: 522506
   - 用途：整合 MCP (Model Context Protocol) 功能

3. **聯繫你的 NetSuite Partner**
   - 如果你有 NetSuite 實施夥伴
   - 他們可以協助安裝和配置

---

## 📊 診斷結果判斷

### ✅ 如果一切正常，你應該看到：

1. **NetSuite Integration:**
   - Scope 選項中有 "MCP"
   - MCP scope 已勾選

2. **Zeabur Logs (授權時):**
   ```
   Token exchange response: {
     scope: 'mcp',
     hasAccessToken: true,
     hasRefreshToken: true
   }
   ```

3. **診斷 API (`/api/diagnostics`):**
   ```json
   {
     "session": {
       "config": { "scope": "mcp" },
       "tokens": { "scope": "mcp", "status": "✅ Token 仍在有效期內" }
     },
     "summary": { "status": "✅ 正常" }
   }
   ```

4. **Token 測試 (`/api/test-token`):**
   ```json
   {
     "success": true,
     "status": 200
   }
   ```

5. **N8N:**
   - `List Tools` 返回 NetSuite MCP tools 列表
   - 可以執行 MCP 操作

### ❌ 如果還是失敗，你會看到：

1. **NetSuite Integration:**
   - 看不到 "MCP" scope 選項
   - → SuiteApp 未安裝

2. **授權失敗:**
   - `scope_mismatch` 錯誤
   - → Integration 設置錯誤

3. **Token 測試失敗:**
   - 401/403 錯誤
   - → Token 權限不足（scope 錯誤）

4. **N8N:**
   - "Authentication failed"
   - → MCP 功能不可用（SuiteApp 未安裝）

---

## 🎯 預期結果

**完成所有步驟後：**

1. ✅ NetSuite AI Connector SuiteApp 已安裝
2. ✅ Integration 中有 MCP scope 選項並已勾選
3. ✅ Token 包含 `scope: "mcp"`
4. ✅ MCP Server 可以調用 NetSuite MCP API
5. ✅ N8N 可以使用 NetSuite MCP tools
6. ✅ 所有診斷測試都通過

**如果完成這些後還是不行：**
- 可能是 NetSuite 版本不支持
- 可能是權限問題
- 聯繫 NetSuite 支持進一步診斷

---

**現在開始檢查吧！最關鍵的是第一步：確認是否安裝了 AI Connector SuiteApp。** 🔍

