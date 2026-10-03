import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['packages/*/src/**/*.test.ts', 'apps/server/src/**/*.test.ts'], testTimeout: 120000 } });
