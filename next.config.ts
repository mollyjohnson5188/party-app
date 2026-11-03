import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本地预览用 127.0.0.1，需显式允许该 host（纯 host，不带协议）
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
