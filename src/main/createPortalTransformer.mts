import * as fs from 'fs';
import { createRequire } from 'module';
import * as path from 'path';
import type { RawSourceMap } from 'source-map';
import type * as tsNamespace from 'typescript';
import createTransformer from './createTransformer.mjs';
import { printSourceWithMap, type TransformOptions } from './transform.mjs';

const require = createRequire(import.meta.url);

export interface CreatePortalTransformerOptions extends TransformOptions {
  project?: string;
  typescript?: string | typeof tsNamespace;
  cwd?: string;
}

export interface PortalTransformer {
  /** The `typescript` namespace object */
  readonly ts: typeof tsNamespace;
  /** Active `Program` instance for the transformer */
  readonly program: tsNamespace.Program;
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
  ): [newSource: string, newSourceMap: RawSourceMap | undefined];
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
  ): [newSource: string | null, newSourceMap: RawSourceMap | undefined];
}

function createPortalTransformerImpl(
  options: CreatePortalTransformerOptions,
  ts: typeof tsNamespace
): PortalTransformer {
  const project = options.project ?? 'tsconfig.json';
  let ignoreFiles = options.ignoreFiles ?? [];
  if (typeof ignoreFiles !== 'function') {
    const a = ignoreFiles;
    ignoreFiles = (fileName: string) => {
      return a.some((t) => {
        if (typeof t === 'string') {
          return fileName.indexOf(t) >= 0;
        } else {
          return t.test(fileName);
        }
      });
    };
  }
  const cwd = options.cwd ?? process.cwd();
  const getCurrentDirectory = () => cwd;
  const config = ts.getParsedCommandLineOfConfigFile(project, void 0, {
    fileExists: fs.existsSync,
    getCurrentDirectory,
    // eslint-disable-next-line @typescript-eslint/unbound-method
    readDirectory: ts.sys.readDirectory,
    readFile: (file) =>
      fs.readFileSync(
        path.isAbsolute(file) ? file : path.join(getCurrentDirectory(), file),
        'utf-8'
      ),
    useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
    onUnRecoverableConfigFileDiagnostic: (diag) => {
      throw new Error(
        ts.formatDiagnostics([diag], {
          getCanonicalFileName: (f) => f,
          getCurrentDirectory,
          getNewLine: () => '\n',
        })
      );
    },
  });
  if (!config) {
    throw new Error(
      `[ts-const-value-transformer] Unable to load tsconfig file (effective name = '${project}')`
    );
  }
  const program = ts.createProgram({
    options: config.options,
    rootNames: config.fileNames,
  });

  return {
    ts,
    program,
    transform: (content, fileName, sourceMap, individualOptions) => {
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
      // If input content is changed, replace it
      if (content != null && sourceFile.getFullText() !== content) {
        sourceFile.update(content, {
          span: { start: 0, length: sourceFile.end },
          newLength: content.length,
        });
      }
      const transformer = createTransformer(program, {
        options: { ...options, ...individualOptions, ts },
      });
      const result = ts.transform(
        sourceFile,
        [transformer],
        program.getCompilerOptions()
      );
      const transformedSource = result.transformed[0]!;
      // If unchanged, return base file as-is
      if (transformedSource === sourceFile) {
        return [content ?? sourceFile.getFullText(), rawSourceMap];
      }
      const printed = printSourceWithMap(
        transformedSource,
        fileName,
        rawSourceMap
      );
      return printed;
    },
  };
}

/**
 * Creates the new portal transformer instance for the TS project.
 * After creation, the transformation process can be performed by calling {@link PortalTransformer.transform}.
 */
export default async function createPortalTransformer(
  options: CreatePortalTransformerOptions = {}
): Promise<PortalTransformer> {
  let ts;
  if (options.typescript != null) {
    if (typeof options.typescript === 'string') {
      ts = (await import(options.typescript)) as typeof tsNamespace;
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
 * After creation, the transformation process can be performed by calling {@link PortalTransformer.transform}.
 */
export function createPortalTransformerSync(
  options: CreatePortalTransformerOptions = {}
): PortalTransformer {
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
