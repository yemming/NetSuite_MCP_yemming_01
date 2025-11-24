/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  
  // 配置 webpack/turbopack 處理外部依賴
  experimental: {
    // Turbopack 特定配置
    serverComponentsExternalPackages: ['@suiteinsider/netsuite-mcp'],
  },
  
  // 忽略特定的構建警告
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 標記 @suiteinsider/netsuite-mcp 為外部依賴，不進行打包
      config.externals = config.externals || [];
      config.externals.push('@suiteinsider/netsuite-mcp');
    }
    return config;
  },
};

module.exports = nextConfig;

