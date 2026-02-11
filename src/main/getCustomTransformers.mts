// for ts-loader

import type * as ts from 'typescript';
import createTransformer from './createTransformer.mjs';

export default function getCustomTransformers(
  program: ts.Program,
  _getProgram: () => ts.Program
): ts.CustomTransformers {
  return { before: [createTransformer(program)] };
}
