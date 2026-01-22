import type * as ts from 'typescript';
import {
  getIgnoreFilesFunction,
  transformSource,
  type TransformOptions,
} from './transform.mjs';

interface Config {
  options?: TransformOptions;
}

// Accepts undefined for the factory
export type TransformerFactory = (
  context?: ts.TransformationContext
) => (sourceFile: ts.SourceFile) => ts.SourceFile;

export default function createTransformer(
  program: ts.Program,
  // for ttypescript and ts-patch
  config?: Config,
  // for ts-patch
  extras?: { ts?: typeof ts }
): TransformerFactory {
  const options: TransformOptions = {
    ...config?.options,
    ...(extras?.ts && { ts: extras?.ts }),
  };
  const ignoreFiles = getIgnoreFilesFunction(options.ignoreFiles);
  return ((context) => {
    return (sourceFile) => {
      if (ignoreFiles(sourceFile.fileName)) {
        return sourceFile;
      }
      return transformSource(sourceFile, program, context, options);
    };
  }) satisfies TransformerFactory satisfies ts.TransformerFactory<ts.SourceFile>;
}
