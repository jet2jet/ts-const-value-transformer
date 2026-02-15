import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import { createPortalTransformerWithTsLs } from '@/index.mjs';

describe('createPortalTransformerWithTsLs', () => {
  testPortalTransformer(createPortalTransformerWithTsLs);
});
