import * as path from 'path';
import type * as tsNamespace from 'typescript';
import type * as webpack from 'webpack';
import createPortalTransformer, {
  type CreatePortalTransformerOptions,
  type PortalTransformer,
} from './createPortalTransformer.mjs';
import createPortalTransformerWithTs7, {
  type CreatePortalTransformerWithTs7Options,
  type PortalTransformerWithTs7,
} from './createPortalTransformerWithTs7.mjs';
import { isTypeScript7 } from './utils.mjs';

export type TsConstValueTransformerLoaderOptions =
  | CreatePortalTransformerOptions
  | CreatePortalTransformerWithTs7Options;

const transformerMap: Map<
  string,
  PortalTransformer | PortalTransformerWithTs7
> = new Map();

async function loadAndDetectIfTs7(
  options: TsConstValueTransformerLoaderOptions
): Promise<
  | [ts: typeof tsNamespace | null, isTs7: true]
  | [ts: typeof tsNamespace, isTs7: false]
> {
  let ts;
  if ('typescript' in options && options.typescript != null) {
    if (typeof options.typescript === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts = (await eval('import(options.typescript)')) as typeof tsNamespace;
    } else {
      ts = options.typescript;
    }
  } else if ('ts7Api' in options && options.ts7Api != null) {
    return [null, true];
  } else if (options.ts != null) {
    ts = options.ts;
  } else {
    ts = await import('typescript');
  }
  return [ts, isTypeScript7(ts)];
}

const loader: webpack.LoaderDefinitionFunction<
  TsConstValueTransformerLoaderOptions | undefined
> = function (content, sourceMap) {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions, @typescript-eslint/strict-boolean-expressions
  this.cacheable && this.cacheable();
  this.async();
  void (async () => {
    try {
      const options = this.getOptions() || {};
      const project = options.project ?? 'tsconfig.json';
      // Use webpack's cache system by default
      const cacheResult = options.cacheResult ?? false;
      let transformer = transformerMap.get(project);
      if (!transformer) {
        const [ts, isTs7] = await loadAndDetectIfTs7(options);
        if (isTs7) {
          const ts7Options = {
            cwd: path.dirname(this.resourcePath),
            ...options,
            project,
            cacheResult,
          } as CreatePortalTransformerWithTs7Options;
          // Adjust package paths
          if (
            'typescript' in options &&
            typeof options.typescript === 'string'
          ) {
            ts7Options.ts7Ast = `${options.typescript}/unstable/ast`;
            ts7Options.ts7AstFactory = `${options.typescript}/unstable/ast/factory`;
            ts7Options.ts7AstUtils = `${options.typescript}/unstable/ast/utils`;
            ts7Options.ts7Api = `${options.typescript}/unstable/sync`;
          }
          transformer = await createPortalTransformerWithTs7(ts7Options);
        } else {
          const { typescript: _, ...rest } =
            options as CreatePortalTransformerOptions;
          transformer = await createPortalTransformer({
            cwd: path.dirname(this.resourcePath),
            ...rest,
            project,
            ts,
            cacheResult,
          });
        }
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
