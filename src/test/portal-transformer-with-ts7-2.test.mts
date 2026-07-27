import { createRequire } from 'module';
import { jest } from '@jest/globals';
import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import type { createPortalTransformer } from '@/index.mjs';
import type * as tscTransformer from '@/tscTransformer.mjs';
const require = createRequire(import.meta.url);

let isMockImported = false;
jest.mock('typescript', () => {
  isMockImported = true;
  return require('@typescript/native') as unknown;
});
// In this test tscTransformer (which uses older TypeScript) should not be used
jest.unstable_mockModule('@/tscTransformer.mjs', (): typeof tscTransformer => {
  const fnErr = () => {
    throw new Error('Should not be called');
  };
  return {
    printSource: fnErr,
    printSourceWithMap: fnErr,
    transformAndPrintSource: fnErr,
    transformAndPrintSourceWithMap: fnErr,
    transformSource: fnErr,
  };
});

describe('createPortalTransformer with TS7', () => {
  let create: typeof createPortalTransformer;
  beforeAll(async () => {
    create = (await import('@/index.mjs')).createPortalTransformer;
  });
  testPortalTransformer(
    (...args) => create(...args),
    () => ({
      typescript: '@typescript/native',
    }),
    () => {
      expect(isMockImported).toBe(true);
    }
  );
});
