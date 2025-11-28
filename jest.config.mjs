// import * as path from 'path';
// import { fileURLToPath } from 'url';
import { createDefaultEsmPreset } from 'ts-jest';

// const thisDir = fileURLToPath(new URL('.', import.meta.url));

const presetConfig = createDefaultEsmPreset({
  tsconfig: './tsconfig.test.json',
  diagnostics: {
    ignoreCodes: ['TS151001'],
  },
});

export default {
  ...presetConfig,
  clearMocks: true,
  testMatch: ['<rootDir>/src/test/**/*.test.mts'],
  // setupFilesAfterEnv: ['<rootDir>/src/test/setupTest.mts'],
  moduleNameMapper: {
    '^@/(.*)\\.mjs$': ['<rootDir>/src/main/$1', '<rootDir>/src/test-common/$1'],
    '^@/(.*)$': ['<rootDir>/src/main/$1', '<rootDir>/src/test-common/$1'],
    '(.+)\\.mjs': '$1',
    '(.+)\\.jsx': '$1',
  },
  globals: {
    __DEV__: true,
  },
};
