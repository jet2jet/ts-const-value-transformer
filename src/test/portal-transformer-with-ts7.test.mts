import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import { createPortalTransformerWithTs7 } from '@/index.mjs';

describe('createPortalTransformerWithTs7', () => {
  testPortalTransformer(createPortalTransformerWithTs7, () => ({
    ts7Ast: '@typescript/native/unstable/ast',
    ts7AstFactory: '@typescript/native/unstable/ast/factory',
    ts7AstUtils: '@typescript/native/unstable/ast/utils',
    ts7Api: '@typescript/native/unstable/sync',
  }));
});
