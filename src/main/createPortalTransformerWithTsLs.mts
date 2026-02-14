import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import type { RawSourceMap } from 'source-map';
import type * as tsNamespace from 'typescript';
import type {
  PortalTransformerResult,
  PortalTransformerResultNonNull,
} from './createPortalTransformer.mjs';
import TsLspClient from './lsp/TsLspClient.mjs';
import { transformAndPrintSourceWithMap } from './lspTransformer.mjs';
import { getIgnoreFilesFunction, type TransformOptions } from './transform.mjs';

const require = createRequire(import.meta.url);

export interface CreatePortalTransformerWithTsLsOptions
  extends TransformOptions {
  /**
   * Command to run language server. The first element is used for command name and following elements are used for `argv`.
   * Default is `['npx', 'tsgo', '--lsp', '--stdio']`.
   */
  command?: readonly string[];
  /** Path to tsconfig.json. If omitted, `tsconfig.json` will be used. **Currently `project` must be path to `tsconfig.json` file name; other than `tsconfig.json` is not supported.** */
  project?: string;
  /** Package path to `typescript` or `typescript` namespace object. This is still necessary to retrieve AST. */
  typescript?: string | typeof tsNamespace;
  /** The current directory for file search. Also affects to `project` option. */
  cwd?: string;
  /** Specifies to cache base (original) source code for check if the input is changed. Default is false. */
  cacheBaseSource?: boolean;
  /** Specifies to cache result source code. Default is true (false for webpack loader). If the latter process has cache system, specifies false to reduce memory usage. */
  cacheResult?: boolean;
}

export interface PortalTransformerWithTsLs {
  /** The `typescript` namespace object */
  readonly ts: typeof tsNamespace;
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
  options: CreatePortalTransformerWithTsLsOptions,
  ts: typeof tsNamespace
): PortalTransformerWithTsLs {
  const project = options.project ?? 'tsconfig.json';
  if (path.basename(project) !== 'tsconfig.json') {
    throw new Error(
      `options.project must be 'tsconfig.json' due to restriction of language-server (actual: "${project}")`
    );
  }
  const commandArray = options.command ?? ['npx', 'tsgo', '--lsp', '--stdio'];
  if (commandArray.length < 1) {
    throw new Error(`options.command must have at least one element`);
  }
  const ignoreFiles = getIgnoreFilesFunction(options.ignoreFiles);
  const cwd = options.cwd ?? process.cwd();
  const cacheBaseSource = options.cacheBaseSource ?? false;
  const cacheResult = options.cacheResult ?? true;

  const workspaceFolder = path.dirname(path.resolve(cwd, project));

  const client = new TsLspClient(commandArray[0]!, commandArray.slice(1));
  let isInitialized = false;

  const cache = new Map<
    string,
    {
      content: string | null;
      optJson: string;
      result: PortalTransformerResultNonNull;
    }
  >();
  const sourceFileMap = new Map<string, tsNamespace.SourceFile>();

  const getSourceFile = (
    fileName: string,
    content?: string | null
  ): tsNamespace.SourceFile => {
    let sourceFile = sourceFileMap.get(fileName);
    if (!sourceFile) {
      if (content == null) {
        content = fs.readFileSync(fileName, 'utf-8');
      }
      sourceFile = ts.createSourceFile(
        fileName,
        content,
        ts.ScriptTarget.Latest,
        true
      );
      sourceFileMap.set(fileName, sourceFile);
      client.openDocument(fileName, content);
    }
    return sourceFile;
  };

  const instance = {
    ts,
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

      if (!isInitialized) {
        client.initialize(workspaceFolder);
      }

      let sourceFile = sourceFileMap.get(fileName);
      if (!sourceFile) {
        sourceFile = getSourceFile(fileName, content);
      }
      // If input content is changed, replace it
      else if (content != null && sourceFile.text !== content) {
        sourceFile.update(content, {
          span: { start: 0, length: sourceFile.end },
          newLength: content.length,
        });
        sourceFile.text = content;
      }

      if (!isInitialized) {
        client.waitForFirstDiagnosticsReceived();
        isInitialized = true;
      }

      const result: PortalTransformerResultNonNull =
        transformAndPrintSourceWithMap(
          sourceFile,
          client,
          getSourceFile,
          fileName,
          { ...options, ...individualOptions, ts },
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

      client.closeDocument(fileName);
      return result;
    },
    close: () => {
      client.exit();
    },
  } satisfies PortalTransformerWithTsLs;
  return instance;
}

/**
 * Creates the new portal transformer instance for the TS project using language server.
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTsLs.transform}.
 */
export default async function createPortalTransformerWithTsLs(
  options: CreatePortalTransformerWithTsLsOptions = {}
): Promise<PortalTransformerWithTsLs> {
  let ts;
  if (options.typescript != null) {
    if (typeof options.typescript === 'string') {
      // Use eval to avoid webpack warnings
      // eslint-disable-next-line no-eval
      ts = (await eval('import(options.typescript)')) as typeof tsNamespace;
    } else {
      ts = options.typescript;
    }
  } else if (options.ts != null) {
    ts = options.ts;
  } else {
    ts = await import('typescript');
  }
  return createPortalTransformerImpl(options, ts);
}

/**
 * Creates the new portal transformer instance for the TS project (using `require` function).
 * After creation, the transformation process can be performed by calling {@link PortalTransformerWithTsLs.transform}.
 */
export function createPortalTransformerSyncWithTsLs(
  options: CreatePortalTransformerWithTsLsOptions = {}
): PortalTransformerWithTsLs {
  let ts;
  if (options.typescript != null) {
    if (typeof options.typescript === 'string') {
      ts = require(options.typescript) as typeof tsNamespace;
    } else {
      ts = options.typescript;
    }
  } else if (options.ts != null) {
    ts = options.ts;
  } else {
    ts = require('typescript') as typeof tsNamespace;
  }
  return createPortalTransformerImpl(options, ts);
}
