import * as path from 'path';
import type * as webpack from 'webpack';
import createPortalTransformer, {
  type CreatePortalTransformerOptions,
  type PortalTransformer,
} from './createPortalTransformer.mjs';

export type TsConstValueTransformerLoaderOptions =
  CreatePortalTransformerOptions;

const transformerMap: Map<string, PortalTransformer> = new Map();

const loader: webpack.LoaderDefinitionFunction<
  TsConstValueTransformerLoaderOptions | undefined
> = function (content, sourceMap) {
  this.async();
  void (async () => {
    try {
      const options = this.getOptions() || {};
      const project = options.project ?? 'tsconfig.json';
      let transformer = transformerMap.get(project);
      if (!transformer) {
        transformer = await createPortalTransformer({
          cwd: path.dirname(this.resourcePath),
          ...options,
        });
        transformerMap.set(project, transformer);
      }
      const result = transformer.transform(content, this.resource, sourceMap);
      this.callback(null, result[0], result[1]);
    } catch (e) {
      this.callback(e as Error);
    }
  })();
};
export default loader;
