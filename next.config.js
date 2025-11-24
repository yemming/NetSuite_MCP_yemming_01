/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // Next.js 16: 使用 serverExternalPackages 替代 experimental.serverComponentsExternalPackages
  // 標記 @suiteinsider/netsuite-mcp 為外部依賴，不進行打包
  serverExternalPackages: ['@suiteinsider/netsuite-mcp'],
  
  // Next.js 16 默認使用 Turbopack，設置空配置明確使用 Turbopack
  // 這樣可以避免 webpack 配置衝突
  turbopack: {},
};

module.exports = nextConfig;

