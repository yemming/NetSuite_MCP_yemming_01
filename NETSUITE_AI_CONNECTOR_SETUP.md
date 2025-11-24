# NetSuite AI Connector SuiteApp 安裝指南

## 🚨 重要提醒

根據 [NetSuite MCP Server 官方文檔](https://lobehub.com/zh-TW/mcp/dsvantien-netsuite-mcp-server)，**NetSuite AI Connector SuiteApp 是使用 MCP 功能的絕對前提**。

> Without it, the MCP tools will not be available even after authentication.

這就是為什麼你的認證一直失敗的原因！

---

## 📋 完整安裝檢查清單

### ✅ Step 1: 檢查是否已安裝 AI Connector SuiteApp

**Bundle ID: 522506**

1. 登入 NetSuite
2. 前往：**Customization > SuiteBundler > Search & Install Bundles**
3. 點擊 "List" 標籤查看已安裝的 Bundles
4. 搜索 "NetSuite AI Connector" 或 Bundle ID "522506"

**如果找不到**：
- ❌ 這就是問題所在！
- ✅ 需要先安裝這個 SuiteApp

**如果已安裝**：
- ✅ 檢查狀態是否為 "Installed"
- ✅ 檢查是否已正確配置

---

### 📦 Step 2: 安裝 NetSuite AI Connector SuiteApp

**如果還沒安裝，按以下步驟操作：**

1. **搜索 Bundle**
   - 前往：**Customization > SuiteBundler > Search & Install Bundles**
   - 在搜索框輸入：**NetSuite AI Connector**
   - 或直接搜索 Bundle ID: **522506**

2. **安裝 Bundle**
   - 點擊搜索結果
   - 點擊 "Install" 按鈕
   - 按照安裝向導完成安裝
   - 可能需要管理員權限

3. **配置 SuiteApp**
   - 安裝完成後，可能需要進行初始配置
   - 按照 SuiteApp 的設置向導完成配置

**注意事項：**
- 📌 需要 NetSuite 管理員權限
- 📌 可能需要聯繫 NetSuite 支持或你的 NetSuite Partner
- 📌 某些 NetSuite 版本可能不支持此 SuiteApp
- 📌 安裝可能需要一些時間

---

### 🔑 Step 3: 創建或更新 OAuth Integration Record

**安裝 SuiteApp 後，檢查你的 Integration 設置：**

1. **前往 Integration 管理**
   - Setup > Integration > Manage Integrations > New
   - 或編輯現有的 Integration

2. **必須的設置**
   - ✅ **Name**: 例如 "MCP Server Integration"
   - ✅ **OAuth 2.0**: **必須勾選**
   - ✅ **Authorization Code Grant**: **必須勾選**
   - ✅ **Public Client**: **必須勾選**（不使用 Client Secret）
   - ✅ **Redirect URI**: 你的應用 URL + `/api/callback`
     - 例如：`https://你的zeabur網址.zeabur.app/api/callback`

3. **關鍵：Scope 設置**
   - 安裝 AI Connector SuiteApp 後，應該會看到 **"MCP"** 或類似的 scope 選項
   - ✅ **勾選 MCP scope**
   - ❌ 不要同時勾選其他 scope（如 REST Web Services）
   - ⚠️ 如果看不到 MCP scope，說明 SuiteApp 安裝有問題

4. **保存並複製 Client ID**
   - 保存 Integration 記錄
   - 複製 **Client ID**（Consumer Key）
   - 更新 Zeabur 環境變量

---

### 🔍 Step 4: 驗證安裝

**檢查 Scope 是否可用：**

1. 在你的 Integration 記錄中，應該能看到：
   - Available Scopes 或 Enabled Scopes
   - 其中應該包含 "MCP" 或 "NetSuite AI Connector"

2. 如果看不到 MCP scope：
   - ❌ SuiteApp 安裝不完整
   - ❌ SuiteApp 配置不正確
   - ❌ 你的 NetSuite 版本可能不支持

---

## 🛠️ 安裝後的配置更新

### 更新 Zeabur 環境變量

安裝 SuiteApp 並創建 Integration 後，確認環境變量：

```bash
# 必需
NETSUITE_ACCOUNT_ID=td3018275          # 小寫
NETSUITE_CLIENT_ID=你的新ClientID      # 從新的 Integration 複製

# 重要：Scope 設置
NETSUITE_SCOPE=mcp                      # 明確設置為 'mcp'

# 其他
APP_BASE_URL=https://你的zeabur網址.zeabur.app
```

---

## 🔄 完整的重新授權流程

安裝 SuiteApp 後，執行完整的授權流程：

### 1. 清理舊 session

```bash
curl -X POST https://你的zeabur網址.zeabur.app/api/auth/cleanup
```

### 2. 重新授權

訪問：
```
https://你的zeabur網址.zeabur.app/api/auth/login
```

這次應該會：
- ✅ 使用 `mcp` scope 進行授權
- ✅ Token 包含 MCP 權限
- ✅ 能夠訪問 NetSuite MCP tools

### 3. 驗證結果

訪問診斷 API：
```
https://你的zeabur網址.zeabur.app/api/diagnostics
```

應該看到：
```json
{
  "session": {
    "config": {
      "scope": "mcp"
    },
    "tokens": {
      "scope": "mcp"
    }
  }
}
```

### 4. 測試 Token

訪問：
```
https://你的zeabur網址.zeabur.app/api/test-token
```

應該返回成功（200 OK）。

### 5. N8N 測試

在 N8N 執行 `List Tools`，應該能看到 NetSuite MCP tools 列表。

---

## ❓ 常見問題

### Q1: 找不到 NetSuite AI Connector SuiteApp？

**可能原因：**
1. 你的 NetSuite 版本不支持此 SuiteApp
2. 你的帳號沒有安裝 Bundle 的權限
3. SuiteApp 尚未對你的地區/版本開放

**解決方案：**
1. 聯繫 NetSuite 支持確認可用性
2. 請 NetSuite 管理員安裝
3. 確認你的 NetSuite 版本支持 MCP

### Q2: 安裝了 SuiteApp 但看不到 MCP scope？

**可能原因：**
1. SuiteApp 安裝不完整
2. SuiteApp 配置未完成
3. 需要重新創建 Integration 記錄

**解決方案：**
1. 重新安裝 SuiteApp
2. 完成 SuiteApp 的初始配置
3. 刪除並重新創建 Integration 記錄

### Q3: 授權後還是失敗？

**檢查項目：**
1. ✅ SuiteApp 已安裝且狀態為 "Installed"
2. ✅ Integration 中勾選了 MCP scope
3. ✅ Zeabur 環境變量設置為 `NETSUITE_SCOPE=mcp`
4. ✅ 已清理舊 session 並重新授權
5. ✅ Token 中包含 `scope: "mcp"`

### Q4: 我的 NetSuite 版本不支持 AI Connector SuiteApp？

**替代方案：**
1. 檢查是否有其他可用的 scope（如 `rest_webservices`）
2. 使用 REST API 而不是 MCP（功能會有限制）
3. 升級 NetSuite 版本或聯繫 NetSuite 銷售

**注意：** 
- 沒有 AI Connector SuiteApp，MCP 功能無法使用
- 即使 OAuth 成功，也無法訪問 MCP tools

---

## 📚 參考資料

- [NetSuite MCP Server 官方文檔](https://lobehub.com/zh-TW/mcp/dsvantien-netsuite-mcp-server)
- [NetSuite SuiteApp 安裝指南](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/)
- [NetSuite OAuth 2.0 文檔](https://docs.oracle.com/en/cloud/saas/netsuite/ns-online-help/section_158081952044.html)

---

## 🎯 總結

**問題根源：**
- ❌ 沒有安裝 NetSuite AI Connector SuiteApp (Bundle ID: 522506)
- ❌ Integration 中沒有 MCP scope
- ❌ Token 缺少 MCP 權限

**解決步驟：**
1. ✅ 安裝 NetSuite AI Connector SuiteApp
2. ✅ 創建/更新 Integration 並勾選 MCP scope
3. ✅ 設置 Zeabur 環境變量 `NETSUITE_SCOPE=mcp`
4. ✅ 清理舊 session 並重新授權
5. ✅ 驗證 token 包含 MCP scope
6. ✅ 測試 N8N 連接

**如果 SuiteApp 無法安裝：**
- 聯繫 NetSuite 支持
- 確認你的版本和權限
- 考慮其他整合方案

---

**完成這些步驟後，你的 MCP Server 應該就能正常工作了！** 🎉

