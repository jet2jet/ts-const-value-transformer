import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import { createPortalTransformerWithTs7 } from '@/index.mjs';

describe('createPortalTransformerWithTs7', () => {
  testPortalTransformer(createPortalTransformerWithTs7, () => ({
    ts7Ast: '@typescript/native/ast',
    ts7AstFactory: '@typescript/native/ast/factory',
    ts7AstUtils: '@typescript/native/ast/utils',
    ts7Api: '@typescript/native/sync',
  }));
});
