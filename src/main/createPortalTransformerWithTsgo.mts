import { createRequire } from 'module';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type * as tsgoAst from '@typescript/native/unstable/ast';
import type * as tsgoAstFactory from '@typescript/native/unstable/ast/factory';
import type * as tsgoAstUtils from '@typescript/native/unstable/ast/utils';
import type * as tsgoApi from '@typescript/native/unstable/sync';
import type { RawSourceMap } from 'source-map';
import type {
  PortalTransformerResult,
  PortalTransformerResultNonNull,
} from './createPortalTransformer.mjs';
import { getIgnoreFilesFunction, type TransformOptions } from './transform.mjs';
import { transformAndPrintSourceWithMap } from './tsgoTransformer.mjs';

const require = createRequire(import.meta.url);

export interface CreatePortalTransformerWithTsgoOptions
  extends TransformOptions {
  /**
   * Command to run language server. The first element is used for command name and following elements are used for `argv`.
   * Default is `['npx', 'tsgo', '--lsp', '--stdio']`.
   */
  command?: readonly string[];
  /** Path to tsconfig.json. If omitted, `tsconfig.json` will be used. **Currently `project` must be path to `tsconfig.json` file name; other than `tsconfig.json` is not supported.** */
  project?: string;
  /** Package path to `typescript/unstable/ast` or `typescript/unstable/ast` namespace object. */
  tsgoAst?: string | typeof tsgoAst;
  /**
   * Package path to `typescript/unstable/ast/factory` or `typescript/unstable/ast/factory` namespace object.
   * If omitted and {@linkcode tsgoAst} is a string value, `tsgoAst + '/factory'` is used.
   */
  tsgoAstFactory?: string | typeof tsgoAstFactory;
  /**
   * Package path to `typescript/unstable/ast/utils` or `typescript/unstable/ast/utils` namespace object.
   * If omitted and {@linkcode tsgoAst} is a string value, `tsgoAst + '/utils'` is used.
   */
  tsgoAstUtils?: string | typeof tsgoAstUtils;
  /** Package path to `typescript/unstable/sync` or `typescript/unstable/sync` namespace object. */
  tsgoApi?: string | typeof tsgoApi;
  /** The current directory for file search. Also affects to `project` option. */
  cwd?: string;
  /** Specifies to cache base (original) source code for check if the input is changed. Default is false. */
  cacheBaseSource?: boolean;
  /** Specifies to cache result source code. Default is true (false for webpack loader). If the latter process has cache system, specifies false to reduce memory usage. */
  cacheResult?: boolean;
}

export interface PortalTransformerWithTsgo {
  /** The `typescript/unstable/ast` namespace object */
  readonly tsgoAst: typeof tsgoAst;
  /** The `typescript/unstable/ast/factory` namespace object */
  readonly tsgoAstFactory: typeof tsgoAstFactory;
  /** The `typescript/unstable/ast/utils` namespace object */
  readonly tsgoAstUtils: typeof tsgoAstUtils;
  /** The `typescript/unstable/sync` namespace object */
  readonly tsgoApi: typeof tsgoApi;
  /** Clears transformed cache. */
  clearCache(): void;
  /**
   * Performs transformation.
   * @param content Base source code. If null, uses loaded source code in the TS project.
   * @param fileName Base file name (If not included in the TS project, transformation will not be performed.)
   * @param sourceMap Base source map if exists
   * @param options Transform options (addition to `options` passed to `createPortalTransformer`)
   * @returns Tuple of new source code and source map. Source map may be undefined if source code is unchanged.
   */
  transform(
    content: string,
    fileName: string,
    sourceMap?: string | RawSourceMap | null,
    options?: TransformOptions
  ): PortalTransformerResultNonNull;
  /**
   * Performs transformation.
   * @param content Base source code. If null, uses loaded source code in the TS project.
   * @param fileName Base file name (If not included in the TS project, transformation will not be performed.)
   * @param sourceMap Base source map if exists
   * @param options Transform options (addition to `options` passed to `createPortalTransformer`)
   * @returns Tuple of new source code and source map. Source map may be undefined if source code is unchanged.
   */
  transform(
    content: string | null,
    fileName: string,
    sourceMap?: string | RawSourceMap | null,
    options?: TransformOptions
  ): PortalTransformerResult;
  /**
   * Closes the LSP client.
   */
  close(): void;
}

function optionsToString(options: TransformOptions) {
  return JSON.stringify(options, (key, value: unknown) => {
    if (typeof value === 'function' || value instanceof RegExp) {
      return value.toString();
    }
    if (key === 'typescript' && typeof value === 'object' && value != null) {
      return '[object typescript]';
    }
    return value;
  });
}

function createPortalTransformerImpl(
  options: CreatePortalTransformerWithTsgoOptions,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils,
  tsgoApiInstance: typeof tsgoApi
): PortalTransformerWithTsgo {
  const project = options.project ?? 'tsconfig.json';
  const ignoreFiles = getIgnoreFilesFunction(options.ignoreFiles);
  const cwd = options.cwd ?? process.cwd();
  const cacheBaseSource = options.cacheBaseSource ?? false;
  const cacheResult = options.cacheResult ?? true;

  const api = new tsgoApiInstance.API({ cwd });
  const conf = api.parseConfigFile({
    uri: pathToFileURL(path.resolve(cwd, project)).toString(),
  });

  if (conf.fileNames.length === 0) {
    throw new Error(
      `[ts-const-value-transformer] Unable to load tsconfig file (effective name = '${project}')`
    );
  }

  const snapshot = api.updateSnapshot({ openProject: conf.fileNames[0]! });
  const tsProject = snapshot.getProjects()[0]!;
  const program = tsProject.program;

  const cache = new Map<
    string,
    {
      content: string | null;
      optJson: string;
      result: PortalTransformerResultNonNull;
    }
  >();

  const instance = {
    tsgoAst: tsgoAstInstance,
    tsgoAstFactory: tsgoAstFactoryInstance,
    tsgoAstUtils: tsgoAstUtilsInstance,
    tsgoApi: tsgoApiInstance,
    clearCache: () => cache.clear(),
    transform: (content, fileName, sourceMap, individualOptions) => {
      const individualOptionsJson = optionsToString(individualOptions ?? {});
      if (cacheResult) {
        const cachedData = cache.get(fileName);
        if (
          cachedData &&
          (!cacheBaseSource || cachedData.content === content) &&
          cachedData.optJson === individualOptionsJson
        ) {
          return cachedData.result;
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const rawSourceMap: RawSourceMap | undefined =
        typeof sourceMap === 'string'
          ? JSON.parse(sourceMap)
          : (sourceMap ?? void 0);

      if (ignoreFiles(fileName)) {
        return [content as string, rawSourceMap];
      }

      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) {
        return [content as string, rawSourceMap];
      }

      const result: PortalTransformerResultNonNull =
        transformAndPrintSourceWithMap(
          tsProject,
          sourceFile,
          tsgoApiInstance,
          tsgoAstInstance,
          tsgoAstFactoryInstance,
          tsgoAstUtilsInstance,
          fileName,
          { ...options, ...individualOptions },
          rawSourceMap
        );
      if (sourceFile.text === result[0]) {
        result[1] = undefined;
      }
      if (cacheResult) {
        // This forces to concatenate strings into flatten one, to reduce object trees for ConsString
        void ((result[0] as unknown as number) | 0);
        const json = result[1];
        if (json) {
          void ((json.mappings as unknown as number) | 0);
        }

        cache.set(fileName, {
          content: cacheBaseSource ? content : '',
          optJson: individualOptionsJson,
          result,
        });
      }

      return result;
    },
    close: () => {
      snapshot.dispose();
    },
  } satisfies PortalTransformerWithTsgo;
  return instance;
}

/**
 * Creates the new portal transformer instance for the TS project using language server.
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTsgo.transform}.
 */
export default async function createPortalTransformerWithTsgo(
  options: CreatePortalTransformerWithTsgoOptions = {}
): Promise<PortalTransformerWithTsgo> {
  let tsgoAstInstance: typeof tsgoAst;
  if (options.tsgoAst != null) {
    if (typeof options.tsgoAst === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoAstInstance = (await eval(
        'import(options.tsgoAst)'
      )) as typeof tsgoAst;
    } else {
      tsgoAstInstance = options.tsgoAst;
    }
  } else {
    tsgoAstInstance = (await import(
      // @ts-expect-error: the import path is different in the development
      'typescript/unstable/ast'
    )) as typeof tsgoAst;
  }
  let tsgoAstFactoryInstance: typeof tsgoAstFactory;
  if (options.tsgoAstFactory != null) {
    if (typeof options.tsgoAstFactory === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoAstFactoryInstance = (await eval(
        'import(options.tsgoAstFactory)'
      )) as typeof tsgoAstFactory;
    } else {
      tsgoAstFactoryInstance = options.tsgoAstFactory;
    }
  } else {
    if (typeof options.tsgoAst === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoAstFactoryInstance = (await eval(
        "import(options.tsgoAst + '/factory')"
      )) as typeof tsgoAstFactory;
    } else {
      tsgoAstFactoryInstance = (await import(
        // @ts-expect-error: the import path is different in the development
        'typescript/unstable/ast/factory'
      )) as typeof tsgoAstFactory;
    }
  }
  let tsgoAstUtilsInstance: typeof tsgoAstUtils;
  if (options.tsgoAstUtils != null) {
    if (typeof options.tsgoAstUtils === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoAstUtilsInstance = (await eval(
        'import(options.tsgoAstUtils)'
      )) as typeof tsgoAstUtils;
    } else {
      tsgoAstUtilsInstance = options.tsgoAstUtils;
    }
  } else {
    if (typeof options.tsgoAst === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoAstUtilsInstance = (await eval(
        "import(options.tsgoAst + '/utils')"
      )) as typeof tsgoAstUtils;
    } else {
      tsgoAstUtilsInstance = (await import(
        // @ts-expect-error: the import path is different in the development
        'typescript/unstable/ast/utils'
      )) as typeof tsgoAstUtils;
    }
  }
  let tsgoApiInstance: typeof tsgoApi;
  if (options.tsgoApi != null) {
    if (typeof options.tsgoApi === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      tsgoApiInstance = (await eval(
        'import(options.tsgoApi)'
      )) as typeof tsgoApi;
    } else {
      tsgoApiInstance = options.tsgoApi;
    }
  } else {
    tsgoApiInstance = (await import(
      // @ts-expect-error: the import path is different in the development
      'typescript/unstable/sync'
    )) as typeof tsgoApi;
  }
  return createPortalTransformerImpl(
    options,
    tsgoAstInstance,
    tsgoAstFactoryInstance,
    tsgoAstUtilsInstance,
    tsgoApiInstance
  );
}

/**
 * Creates the new portal transformer instance for the TS project (using `require` function).
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTsgo.transform}.
 */
export function createPortalTransformerSyncWithTsgo(
  options: CreatePortalTransformerWithTsgoOptions = {}
): PortalTransformerWithTsgo {
  let tsgoAstInstance: typeof tsgoAst;
  if (options.tsgoAst != null) {
    if (typeof options.tsgoAst === 'string') {
      tsgoAstInstance = require(options.tsgoAst) as typeof tsgoAst;
    } else {
      tsgoAstInstance = options.tsgoAst;
    }
  } else {
    tsgoAstInstance = require('typescript/unstable/ast') as typeof tsgoAst;
  }
  let tsgoAstFactoryInstance: typeof tsgoAstFactory;
  if (options.tsgoAstFactory != null) {
    if (typeof options.tsgoAstFactory === 'string') {
      tsgoAstFactoryInstance = require(
        options.tsgoAstFactory
      ) as typeof tsgoAstFactory;
    } else {
      tsgoAstFactoryInstance = options.tsgoAstFactory;
    }
  } else {
    if (typeof options.tsgoAst === 'string') {
      tsgoAstFactoryInstance = require(
        options.tsgoAst + '/factory'
      ) as typeof tsgoAstFactory;
    } else {
      tsgoAstFactoryInstance =
        require('typescript/unstable/ast/factory') as typeof tsgoAstFactory;
    }
  }
  let tsgoAstUtilsInstance: typeof tsgoAstUtils;
  if (options.tsgoAstUtils != null) {
    if (typeof options.tsgoAstUtils === 'string') {
      tsgoAstUtilsInstance = require(
        options.tsgoAstUtils
      ) as typeof tsgoAstUtils;
    } else {
      tsgoAstUtilsInstance = options.tsgoAstUtils;
    }
  } else {
    if (typeof options.tsgoAst === 'string') {
      tsgoAstUtilsInstance = require(
        options.tsgoAst + '/factory'
      ) as typeof tsgoAstUtils;
    } else {
      tsgoAstUtilsInstance =
        require('typescript/unstable/ast/utils') as typeof tsgoAstUtils;
    }
  }
  let tsgoApiInstance: typeof tsgoApi;
  if (options.tsgoApi != null) {
    if (typeof options.tsgoApi === 'string') {
      tsgoApiInstance = require(options.tsgoApi) as typeof tsgoApi;
    } else {
      tsgoApiInstance = options.tsgoApi;
    }
  } else {
    tsgoApiInstance = require('typescript/unstable/sync') as typeof tsgoApi;
  }
  return createPortalTransformerImpl(
    options,
    tsgoAstInstance,
    tsgoAstFactoryInstance,
    tsgoAstUtilsInstance,
    tsgoApiInstance
  );
}
