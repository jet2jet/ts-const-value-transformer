import * as fs from 'fs';
import * as path from 'path';
import type * as tsNamespace from 'typescript';
import type * as webpack from 'webpack';
import createTransformer from './createTransformer.mjs';
import { printSourceWithMap, type TransformOptions } from './transform.mjs';

export interface TsConstValueTransformerLoaderOptions extends TransformOptions {
  project?: string;
  typescript?: string | typeof tsNamespace;
}

const programMap: Map<string, tsNamespace.Program> = new Map();

const loader: webpack.LoaderDefinitionFunction<
  TsConstValueTransformerLoaderOptions | undefined
> = function (content, sourceMap) {
  this.async();
  void (async () => {
    try {
      const options = this.getOptions() || {};
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
      const project = options.project ?? 'tsconfig.json';
      let program = programMap.get(project);
      if (!program) {
        const getCurrentDirectory = () => path.dirname(this.resourcePath);
        const config = ts.getParsedCommandLineOfConfigFile(project, void 0, {
          fileExists: fs.existsSync,
          getCurrentDirectory,
          // eslint-disable-next-line @typescript-eslint/unbound-method
          readDirectory: ts.sys.readDirectory,
          readFile: (file) =>
            fs.readFileSync(
              path.isAbsolute(file)
                ? file
                : path.join(getCurrentDirectory(), file),
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
            `[ts-const-value-transformer-loader] Unable to load tsconfig file (effective name = '${project}')`
          );
        }
        program = ts.createProgram({
          options: config.options,
          rootNames: config.fileNames,
        });
        programMap.set(project, program);
      }
      const sourceFile = program.getSourceFile(this.resource);
      if (!sourceFile) {
        throw new Error(`'${this.resource}' is not in the TypeScript project.`);
      }
      // If input content is changed, replace it
      if (sourceFile.getFullText() !== content) {
        sourceFile.update(content, {
          span: { start: 0, length: sourceFile.end },
          newLength: content.length,
        });
      }

      const transformer = createTransformer(program, {
        options: { ...options, ts },
      });
      const result = ts.transform(
        sourceFile,
        [transformer],
        program.getCompilerOptions()
      );
      const transformedSource = result.transformed[0]!;
      // If unchanged, return base file as-is
      if (transformedSource === sourceFile) {
        this.callback(null, content, sourceMap);
        return;
      }
      const printed = printSourceWithMap(
        transformedSource,
        this.resource,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        typeof sourceMap === 'string' ? JSON.parse(sourceMap) : sourceMap
      );
      this.callback(null, printed[0], printed[1]);
    } catch (e) {
      this.callback(e as Error);
    }
  })();
};
export default loader;
