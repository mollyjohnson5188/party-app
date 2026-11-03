import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // 资金类测试有大量并发 DB 操作，串行跑文件避免相互干扰
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@127.0.0.1:5432/party_test',
      CHECKIN_TOKEN_SECRET: 'test-secret-0123456789abcdef',
      CHECKIN_CODE_KEY: '0123456789abcdef0123456789abcdef',
      PAY_CALLBACK_SECRET: 'test-callback-secret',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
