import * as sourceMap from 'source-map';
import * as ts from 'typescript';

const SYMBOL_ORIGINAL_NODE = Symbol('originalNode');

export interface TransformOptions {
  /** `typescript` namespace object */
  ts?: typeof ts;
  /** Hoist property expressions (`x.prop`) which the value is constant. Default is true, but if the property getter has side effects (not recommended), set false explicitly. */
  hoistProperty?: boolean | undefined;
  /** Hoist function calls which the return value is constant. Default is false because function calls may have side effects. */
  unsafeHoistFunctionCall?: boolean | undefined;
  /** Hoist expressions with `as XXX`. Default is false because the base (non-`as`) value may be non-constant. */
  unsafeHoistAsExpresion?: boolean | undefined;
}

type NonNullableTransformOptions = Required<TransformOptions>;

interface NodeWithSymbols extends ts.Node {
  [SYMBOL_ORIGINAL_NODE]?: ts.Node;
}

function assignDefaultValues(
  options: TransformOptions | undefined
): NonNullableTransformOptions {
  return {
    ts,
    hoistProperty: true,
    unsafeHoistAsExpresion: false,
    unsafeHoistFunctionCall: false,
    ...options,
  };
}

////////////////////////////////////////////////////////////////////////////////

export function transformSource(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options?: TransformOptions
): ts.SourceFile {
  return visitNodeChildren(
    sourceFile,
    sourceFile,
    program,
    context,
    assignDefaultValues(options)
  );
}

function visitNodeChildren(
  node: ts.SourceFile,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.SourceFile;
function visitNodeChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.Node;

function visitNodeChildren(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.Node {
  const newNode = visitNodeAndReplaceIfNeeded(
    node,
    sourceFile,
    program,
    context,
    options
  );
  if ((newNode as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE]) {
    return newNode;
  }
  return ts.visitEachChild(
    newNode,
    (node) => visitNodeChildren(node, sourceFile, program, context, options),
    context
  );
}

function visitNodeAndReplaceIfNeeded(
  node: ts.SourceFile,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.SourceFile;
function visitNodeAndReplaceIfNeeded(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.Node;

function visitNodeAndReplaceIfNeeded(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext,
  options: NonNullableTransformOptions
): ts.Node {
  const ts = options.ts;
  if (!ts.isExpression(node) && !ts.isIdentifier(node)) {
    return node;
  }
  if (
    ts.isLiteralExpression(node) ||
    ts.isObjectLiteralExpression(node) ||
    ts.isPrefixUnaryExpression(node) ||
    ts.isPostfixUnaryExpression(node) ||
    ts.isBinaryExpression(node) ||
    ts.isConditionalExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isSpreadElement(node) ||
    (!options.hoistProperty &&
      ts.isPropertyAccessExpression(node) &&
      !isEnumAccess(node, program, ts)) ||
    (!options.unsafeHoistFunctionCall && ts.isCallLikeExpression(node)) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return node;
  }
  if (ts.isIdentifier(node)) {
    if (
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      !node.parent ||
      (!ts.isExpression(node.parent) &&
        (!('initializer' in node.parent) ||
          node !== node.parent.initializer)) ||
      (!options.hoistProperty &&
        ts.isPropertyAccessExpression(node.parent) &&
        node === node.parent.name)
    ) {
      return node;
    }
  }

  if (
    !options.unsafeHoistAsExpresion &&
    (hasAsExpression(node, context, ts) ||
      hasParentAsExpression(node.parent, context, ts))
  ) {
    return node;
  }

  try {
    const typeChecker = program.getTypeChecker();
    const type = typeChecker.getTypeAtLocation(node);
    const flags = type.getFlags();
    let newNode: ts.Node;
    if (type.isStringLiteral()) {
      newNode = context.factory.createStringLiteral(type.value);
    } else if (type.isNumberLiteral()) {
      if (type.value < 0) {
        newNode = context.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          context.factory.createNumericLiteral(-type.value)
        );
      } else {
        newNode = context.factory.createNumericLiteral(type.value);
      }
    } else if (flags & ts.TypeFlags.BigIntLiteral) {
      newNode = context.factory.createBigIntLiteral(
        typeChecker.typeToString(type)
      );
    } else if (flags & ts.TypeFlags.BooleanLiteral) {
      const text = typeChecker.typeToString(type);
      newNode =
        text === 'true'
          ? context.factory.createTrue()
          : context.factory.createFalse();
    } else if (flags & ts.TypeFlags.Null) {
      newNode = context.factory.createNull();
    } else if (flags & ts.TypeFlags.Undefined) {
      newNode = context.factory.createVoidZero();
    } else {
      return node;
    }

    const result = ts.addSyntheticTrailingComment(
      newNode,
      ts.SyntaxKind.MultiLineCommentTrivia,
      ` ${node.getText(sourceFile)} `
    );
    ts.setTextRange(result, node);
    (result as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE] = node;
    return result;
  } catch {
    return node;
  }
}

function isEnumAccess(
  node: ts.PropertyAccessExpression,
  program: ts.Program,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
  const typeChecker = program.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(node);
  return (type.getFlags() & ts.TypeFlags.EnumLiteral) !== 0;
}

function isAsConstExpression(node: ts.AsExpression): boolean {
  return node.type.getText() === 'const';
}

function hasAsExpression(
  node: ts.Node,
  context: ts.TransformationContext,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
  // including 'as const'
  if (ts.isAsExpression(node)) {
    return true;
  }
  let found = false;
  ts.visitEachChild(
    node,
    (node) => {
      if (!found) {
        found = hasAsExpression(node, context, ts);
      }
      return node;
    },
    context
  );
  return found;
}

function hasParentAsExpression(
  node: ts.Node | null | undefined,
  context: ts.TransformationContext,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
  if (node == null) {
    return false;
  }
  // excluding 'as const'
  if (ts.isAsExpression(node) && !isAsConstExpression(node)) {
    return true;
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (hasAsExpression(node.expression, context, ts)) {
      return true;
    }
  }
  return hasParentAsExpression(node.parent, context, ts);
}

////////////////////////////////////////////////////////////////////////////////

export function printSource(sourceFile: ts.SourceFile): string {
  return printSourceImpl(sourceFile)[0];
}

export function printSourceWithMap(
  sourceFile: ts.SourceFile,
  originalSourceName: string,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const generator = new sourceMap.SourceMapGenerator(startOfSourceMap);
  generator.setSourceContent(originalSourceName, sourceFile.getFullText());
  return printSourceImpl(sourceFile, originalSourceName, generator);
}

interface PositionContext {
  /** original pos */
  pos: number;
  /** generated diff */
  diff: number;
  lastLine: number;
}

function positionToLineAndColumn(
  sourceFile: ts.SourceFile,
  pos: number,
  generatedDiff: number
): sourceMap.Position {
  let line = 0;
  let lastLinePos = 0;
  for (const linePos of sourceFile.getLineStarts()) {
    if (pos < linePos) {
      break;
    }
    lastLinePos = linePos;
    ++line;
  }
  return { line, column: pos - lastLinePos + generatedDiff };
}

function printSourceImpl(sourceFile: ts.SourceFile): [string];
function printSourceImpl(
  sourceFile: ts.SourceFile,
  originalSourceName: string,
  mapGenerator: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap];

function printSourceImpl(
  sourceFile: ts.SourceFile,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap?] {
  const printer = ts.createPrinter({ removeComments: true });
  const r = printNode(
    printer,
    sourceFile.getFullText(),
    sourceFile,
    sourceFile,
    { pos: 0, diff: 0, lastLine: 0 },
    originalSourceName,
    mapGenerator
  );
  return [r, mapGenerator?.toJSON()];
}

function printNode(
  printer: ts.Printer,
  baseSource: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  posContext: PositionContext,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): string {
  const originalNode = (node as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE];
  if (originalNode) {
    let result = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
    const comments = ts.getSyntheticTrailingComments(node);
    if (comments) {
      for (const comment of comments) {
        result += ` /*${comment.text}*/`;
      }
    }
    const old = originalNode.getText(sourceFile);
    const oldFull = baseSource.substring(originalNode.pos, originalNode.end);
    const i = oldFull.lastIndexOf(old);
    const leadingUnchanged = i < 0 ? 0 : i;
    const newText =
      i < 0
        ? result
        : oldFull.substring(0, i) + result + oldFull.substring(i + old.length);

    if (mapGenerator) {
      if (posContext.pos < node.pos) {
        addMappingForCurrent();
      }
      posContext.pos = node.pos;
      if (leadingUnchanged > 0) {
        addMappingForCurrent();
      }
      posContext.pos = node.pos + leadingUnchanged;
      addMappingForCurrent(old);
    }
    posContext.diff += result.length - old.length;
    posContext.pos += old.length;
    addMappingForCurrent();
    posContext.pos = node.end;
    addMappingForCurrent();
    return newText;
  }
  let output = '';
  let headPrinted = false;
  let lastChildPos = 0;
  ts.visitEachChild(
    node,
    (child) => {
      if (!headPrinted) {
        headPrinted = true;
        if (child.pos > node.pos) {
          const text = baseSource.substring(node.pos, child.pos);
          output += text;
          addMappingForCurrent();
          posContext.pos = child.pos;
        }
      } else if (child.pos > lastChildPos) {
        const text = baseSource.substring(lastChildPos, child.pos);
        output += text;
        addMappingForCurrent();
        posContext.pos = child.pos;
      }
      output += printNode(
        printer,
        baseSource,
        sourceFile,
        child,
        posContext,
        originalSourceName,
        mapGenerator
      );
      lastChildPos = child.end;
      return child;
    },
    void 0
  );
  if (!headPrinted) {
    output = baseSource.substring(node.pos, node.end);
    addMappingForCurrent();
    posContext.pos = node.end;
  } else if (lastChildPos < node.end) {
    const text = baseSource.substring(lastChildPos, node.end);
    output += text;
    addMappingForCurrent();
    posContext.pos = node.end;
  }
  addMappingForCurrent();
  return output;

  function addMappingForCurrent(name?: string) {
    const original = positionToLineAndColumn(sourceFile, posContext.pos, 0);
    if (original.line !== posContext.lastLine) {
      posContext.diff = 0;
      posContext.lastLine = original.line;
      if (mapGenerator && original.column > 0) {
        mapGenerator.addMapping({
          original: { line: original.line, column: 0 },
          generated: { line: original.line, column: 0 },
          source: originalSourceName!,
        });
      }
    }
    if (mapGenerator) {
      mapGenerator.addMapping({
        original,
        generated: positionToLineAndColumn(
          sourceFile,
          posContext.pos,
          posContext.diff
        ),
        source: originalSourceName!,
        name,
      });
    }
  }
}
