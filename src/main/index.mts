import createPortalTransformer, {
  createPortalTransformerSync,
  type CreatePortalTransformerOptions,
  type PortalTransformer,
  type PortalTransformerResult,
  type PortalTransformerResultNonNull,
} from './createPortalTransformer.mjs';
import createPortalTransformerWithTs7, {
  createPortalTransformerSyncWithTs7,
  type CreatePortalTransformerWithTs7Options,
  type PortalTransformerWithTs7,
} from './createPortalTransformerWithTs7.mjs';
import createPortalTransformerWithTsLs, {
  createPortalTransformerSyncWithTsLs,
  type CreatePortalTransformerWithTsLsOptions,
  type PortalTransformerWithTsLs,
} from './createPortalTransformerWithTsLs.mjs';
import createTransformer from './createTransformer.mjs';
import version from './version.mjs';

export {
  printSourceWithProxy,
  printSourceWithMapWithProxy,
  transformAndPrintSourceWithProxy,
  transformAndPrintSourceWithMapWithProxy,
  transformSourceWithProxy,
  type TransformOptions,
} from './transform.mjs';

export {
  printSource,
  printSourceWithMap,
  transformAndPrintSource,
  transformAndPrintSourceWithMap,
  transformSource,
} from './tscTransformer.mjs';

export {
  createPortalTransformer,
  createPortalTransformerSync,
  createTransformer,
  type CreatePortalTransformerOptions,
  type PortalTransformer,
  type PortalTransformerResult,
  type PortalTransformerResultNonNull,
  createPortalTransformerWithTsLs,
  createPortalTransformerSyncWithTsLs,
  type CreatePortalTransformerWithTsLsOptions,
  type PortalTransformerWithTsLs,
  createPortalTransformerWithTs7,
  createPortalTransformerSyncWithTs7,
  createPortalTransformerWithTs7 as createPortalTransformerWithTsgo,
  createPortalTransformerSyncWithTs7 as createPortalTransformerSyncWithTsgo,
  type CreatePortalTransformerWithTs7Options as CreatePortalTransformerWithTsgoOptions,
  type PortalTransformerWithTs7 as PortalTransformerWithTsgo,
  version,
};
