import { createRequire } from 'module';
import * as path from 'path';
import { pathToFileURL } from 'url';
import type * as ts7Ast from '@typescript/native/ast';
import type * as ts7AstFactory from '@typescript/native/ast/factory';
import type * as ts7Api from '@typescript/native/sync';
import type { RawSourceMap } from 'source-map';
import type {
  PortalTransformerResult,
  PortalTransformerResultNonNull,
} from './createPortalTransformer.mjs';
import { getIgnoreFilesFunction, type TransformOptions } from './transform.mjs';
import { transformAndPrintSourceWithMap } from './ts7Transformer.mjs';

const require = createRequire(import.meta.url);

export interface CreatePortalTransformerWithTs7Options
  extends TransformOptions {
  /** Path to tsconfig.json. If omitted, `tsconfig.json` will be used. */
  project?: string;
  /** Package path to `typescript/ast` or `typescript/ast` namespace object. */
  ts7Ast?: string | typeof ts7Ast;
  /**
   * Package path to `typescript/ast/factory` or `typescript/ast/factory` namespace object.
   * If omitted and {@linkcode ts7Ast} is a string value, `ts7Ast + '/factory'` is used.
   */
  ts7AstFactory?: string | typeof ts7AstFactory;
  /** Package path to `typescript/sync` or `typescript/sync` namespace object. */
  ts7Api?: string | typeof ts7Api;
  /** The current directory for file search. Also affects to `project` option. */
  cwd?: string;
  /** Specifies to cache base (original) source code for check if the input is changed. Default is false. */
  cacheBaseSource?: boolean;
  /** Specifies to cache result source code. Default is true (false for webpack loader). If the latter process has cache system, specifies false to reduce memory usage. */
  cacheResult?: boolean;
}

export interface PortalTransformerWithTs7 {
  /** The `typescript/ast` namespace object */
  readonly ts7Ast: typeof ts7Ast;
  /** The `typescript/ast/factory` namespace object */
  readonly ts7AstFactory: typeof ts7AstFactory;
  /** The `typescript/sync` namespace object */
  readonly ts7Api: typeof ts7Api;
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
  options: CreatePortalTransformerWithTs7Options,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7ApiInstance: typeof ts7Api
): PortalTransformerWithTs7 {
  const project = options.project ?? 'tsconfig.json';
  const ignoreFiles = getIgnoreFilesFunction(options.ignoreFiles);
  const cwd = options.cwd ?? process.cwd();
  const cacheBaseSource = options.cacheBaseSource ?? false;
  const cacheResult = options.cacheResult ?? true;

  const api = new ts7ApiInstance.API({ cwd });
  const conf = api.parseConfigFile({
    uri: pathToFileURL(path.resolve(cwd, project)).toString(),
  });
  const parsedConfigFile = conf.options.configFilePath;

  if (parsedConfigFile == null) {
    throw new Error(
      `[ts-const-value-transformer] Unable to load tsconfig file (effective name = '${project}')`
    );
  }

  const snapshot = api.createSnapshot({ openProjects: [parsedConfigFile] });
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
    ts7Ast: ts7AstInstance,
    ts7AstFactory: ts7AstFactoryInstance,
    ts7Api: ts7ApiInstance,
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
          ts7ApiInstance,
          ts7AstInstance,
          ts7AstFactoryInstance,
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
  } satisfies PortalTransformerWithTs7;
  return instance;
}

/**
 * Creates the new portal transformer instance for the TS project using language server.
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTs7.transform}.
 */
export default async function createPortalTransformerWithTs7(
  options: CreatePortalTransformerWithTs7Options = {}
): Promise<PortalTransformerWithTs7> {
  let ts7AstInstance: typeof ts7Ast;
  if (options.ts7Ast != null) {
    if (typeof options.ts7Ast === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts7AstInstance = (await eval('import(options.ts7Ast)')) as typeof ts7Ast;
    } else {
      ts7AstInstance = options.ts7Ast;
    }
  } else {
    ts7AstInstance = (await import(
      // @ts-expect-error: the import path is different in the development
      'typescript/ast'
    )) as typeof ts7Ast;
  }
  let ts7AstFactoryInstance: typeof ts7AstFactory;
  if (options.ts7AstFactory != null) {
    if (typeof options.ts7AstFactory === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts7AstFactoryInstance = (await eval(
        'import(options.ts7AstFactory)'
      )) as typeof ts7AstFactory;
    } else {
      ts7AstFactoryInstance = options.ts7AstFactory;
    }
  } else {
    if (typeof options.ts7Ast === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts7AstFactoryInstance = (await eval(
        "import(options.ts7Ast + '/factory')"
      )) as typeof ts7AstFactory;
    } else {
      ts7AstFactoryInstance = (await import(
        // @ts-expect-error: the import path is different in the development
        'typescript/ast/factory'
      )) as typeof ts7AstFactory;
    }
  }
  let ts7ApiInstance: typeof ts7Api;
  if (options.ts7Api != null) {
    if (typeof options.ts7Api === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts7ApiInstance = (await eval('import(options.ts7Api)')) as typeof ts7Api;
    } else {
      ts7ApiInstance = options.ts7Api;
    }
  } else {
    ts7ApiInstance = (await import(
      // @ts-expect-error: the import path is different in the development
      'typescript/sync'
    )) as typeof ts7Api;
  }
  return createPortalTransformerImpl(
    options,
    ts7AstInstance,
    ts7AstFactoryInstance,
    ts7ApiInstance
  );
}

/**
 * Creates the new portal transformer instance for the TS project (using `require` function).
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTs7.transform}.
 */
export function createPortalTransformerSyncWithTs7(
  options: CreatePortalTransformerWithTs7Options = {}
): PortalTransformerWithTs7 {
  let ts7AstInstance: typeof ts7Ast;
  if (options.ts7Ast != null) {
    if (typeof options.ts7Ast === 'string') {
      ts7AstInstance = require(options.ts7Ast) as typeof ts7Ast;
    } else {
      ts7AstInstance = options.ts7Ast;
    }
  } else {
    ts7AstInstance = require('typescript/ast') as typeof ts7Ast;
  }
  let ts7AstFactoryInstance: typeof ts7AstFactory;
  if (options.ts7AstFactory != null) {
    if (typeof options.ts7AstFactory === 'string') {
      ts7AstFactoryInstance = require(
        options.ts7AstFactory
      ) as typeof ts7AstFactory;
    } else {
      ts7AstFactoryInstance = options.ts7AstFactory;
    }
  } else {
    if (typeof options.ts7Ast === 'string') {
      ts7AstFactoryInstance = require(
        options.ts7Ast + '/factory'
      ) as typeof ts7AstFactory;
    } else {
      ts7AstFactoryInstance =
        require('typescript/ast/factory') as typeof ts7AstFactory;
    }
  }
  let ts7ApiInstance: typeof ts7Api;
  if (options.ts7Api != null) {
    if (typeof options.ts7Api === 'string') {
      ts7ApiInstance = require(options.ts7Api) as typeof ts7Api;
    } else {
      ts7ApiInstance = options.ts7Api;
    }
  } else {
    ts7ApiInstance = require('typescript/sync') as typeof ts7Api;
  }
  return createPortalTransformerImpl(
    options,
    ts7AstInstance,
    ts7AstFactoryInstance,
    ts7ApiInstance
  );
}
