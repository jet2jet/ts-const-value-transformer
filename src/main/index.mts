import createPortalTransformer, {
  createPortalTransformerSync,
  type CreatePortalTransformerOptions,
  type PortalTransformer,
  type PortalTransformerResult,
  type PortalTransformerResultNonNull,
} from './createPortalTransformer.mjs';
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
  version,
};
