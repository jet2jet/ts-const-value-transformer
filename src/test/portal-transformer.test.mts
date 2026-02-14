import { testPortalTransformer } from './portal-transformer-test-base.mjs';
import { createPortalTransformer } from '@/index.mjs';

describe('createPortalTransformer', () => {
  testPortalTransformer(createPortalTransformer);
});
