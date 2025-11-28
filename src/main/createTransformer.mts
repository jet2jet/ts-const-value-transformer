import type * as ts from 'typescript';
import { transformSource, type TransformOptions } from './transform.mjs';

interface Config {
  options?: TransformOptions;
}

export default function createTransformer(
  program: ts.Program,
  // for ttypescript and ts-patch
  config?: Config,
  // for ts-patch
  extras?: { ts?: typeof ts }
): ts.TransformerFactory<ts.SourceFile> {
  return (context) => {
    return (sourceFile) => {
      return transformSource(sourceFile, program, context, {
        ...config?.options,
        ...(extras?.ts && { ts: extras?.ts }),
      });
    };
  };
}
