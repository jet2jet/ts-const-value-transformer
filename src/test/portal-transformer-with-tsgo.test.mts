import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import { createPortalTransformerWithTsgo } from '@/index.mjs';

describe('createPortalTransformerWithTsgo', () => {
  testPortalTransformer(createPortalTransformerWithTsgo, () => ({
    tsgoAst: '@typescript/native/unstable/ast',
    tsgoAstFactory: '@typescript/native/unstable/ast/factory',
    tsgoAstUtils: '@typescript/native/unstable/ast/utils',
    tsgoApi: '@typescript/native/unstable/sync',
  }));
});
