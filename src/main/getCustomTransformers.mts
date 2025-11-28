// for ts-loader

import type * as ts from 'typescript';
import createTransformer from './createTransformer.mjs';

export default function getCustomTransformers(
  program: ts.Program,
  _getProgram: () => ts.Program
): {
  before?: Array<ts.TransformerFactory<ts.SourceFile>>;
  after?: Array<ts.TransformerFactory<ts.SourceFile>>;
  afterDeclarations?: Array<ts.TransformerFactory<ts.SourceFile>>;
} {
  return { before: [createTransformer(program)] };
}
