import { type UserConfig } from 'vitest/config';

export const sharedTestConfig: UserConfig['test'] = {
  globals: true,
  exclude: ['**/node_modules/**', '**/dist/**', '**/dist-electron/**', '**/release/**'],
  testTimeout: 5000,
  hookTimeout: 10000,
};
