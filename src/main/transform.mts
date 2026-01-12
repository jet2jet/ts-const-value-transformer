import * as sourceMap from 'source-map';
import * as ts from 'typescript';

const SYMBOL_ORIGINAL_NODE = Symbol('originalNode');

export interface TransformOptions {
  /** `typescript` namespace object */
  ts?: typeof ts;
  /** Hoist property expressions (`x.prop`) which the value is constant. Default is true, but if the property getter has side effects (not recommended), set false explicitly. */
  hoistProperty?: boolean | undefined;
  /** Hoist TypeScript's `enum` values (which are constant). Default is true, but if you want to preserve references, set false explicitly. Note that TypeScript compiler erases `const enum` references unless `preserveConstEnums` is true. */
  hoistEnumValues?: boolean | undefined;
  /** Hoist values defined in the external libraries. Default is true, but if the external libraries are not bundled, set false explicitly to keep references. */
  hoistExternalValues?: boolean | undefined;
  /** Hoist function calls which the return value is constant. Default is false because function calls may have side effects. */
  unsafeHoistFunctionCall?: boolean | undefined;
  /** Hoist function calls, with `@__PURE__` (or `#__PURE__`) comment annotation (must be a multi-line comment), which the return value is constant. Default is false, but if the function really has no side effects, you can safely specify true. If true, `unsafeHoistFunctionCall` option is ignored for `@__PURE__` functions */
  hoistPureFunctionCall?: boolean | undefined;
  /** Hoist expressions with `as XXX`. Default is false because the base (non-`as`) value may be non-constant. */
  unsafeHoistAsExpresion?: boolean | undefined;
  /** Hoist properties/variables that can write (i.e. `let` / `var` variables or properies without `readonly`). Default is false because although the value is literal type at some point, the value may change to another literal type. */
  unsafeHoistWritableValues?: boolean | undefined;
  /**
   * External names (tested with `.includes()` for string, with `.test()` for RegExp) for `hoistExternalValues` settings (If `hoistExternalValues` is not specified, this setting will be used).
   * - Path separators for input file name are always normalized to '/' internally.
   * - Default is `['/node_modules/']`.
   */
  externalNames?: ReadonlyArray<string | RegExp> | undefined;
}

type NonNullableTransformOptions = Required<TransformOptions>;

interface NodeWithSymbols extends ts.Node {
  [SYMBOL_ORIGINAL_NODE]?: ts.Node;
}

function assignDefaultValues(
  options: TransformOptions = {}
): NonNullableTransformOptions {
  return {
    // avoid using spread syntax to override `undefined` (not missing) values
    ts: options.ts ?? ts,
    hoistProperty: options.hoistProperty ?? true,
    hoistEnumValues: options.hoistEnumValues ?? true,
    hoistExternalValues: options.hoistExternalValues ?? true,
    unsafeHoistAsExpresion: options.unsafeHoistAsExpresion ?? false,
    hoistPureFunctionCall: options.hoistPureFunctionCall ?? false,
    unsafeHoistFunctionCall: options.unsafeHoistFunctionCall ?? false,
    unsafeHoistWritableValues: options.unsafeHoistWritableValues ?? false,
    externalNames: options.externalNames ?? [],
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
    // UnaryExpression start
    ts.isPrefixUnaryExpression(node) ||
    ts.isPostfixUnaryExpression(node) ||
    ts.isDeleteExpression(node) ||
    ts.isTypeOfExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isAwaitExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    // UnaryExpression end
    ts.isBinaryExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isConditionalExpression(node) ||
    ts.isVoidExpression(node) ||
    ts.isSpreadElement(node) ||
    (!options.hoistProperty &&
      ts.isPropertyAccessExpression(node) &&
      !isEnumAccess(node, program, ts)) ||
    (!options.hoistEnumValues &&
      ((ts.isPropertyAccessExpression(node) &&
        isEnumAccess(node, program, ts)) ||
        (ts.isIdentifier(node) && isEnumIdentifier(node, program, ts)))) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return node;
  }
  if (
    !options.unsafeHoistFunctionCall &&
    (!options.hoistPureFunctionCall || !hasPureAnnotation(node, sourceFile, ts))
  ) {
    if (ts.isCallLikeExpression(node)) {
      return node;
    }
  }
  if (
    !options.hoistExternalValues &&
    isExternalReference(node, program, options.externalNames)
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
      (ts.isPropertyAccessExpression(node.parent) && node === node.parent.name)
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

  if (!options.unsafeHoistWritableValues) {
    const r = isReadonlyExpression(node, program, ts);
    if (r === false) {
      return node;
    }
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

function isEnumIdentifier(
  node: ts.Identifier,
  program: ts.Program,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
  const typeChecker = program.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(node);
  return (type.getFlags() & ts.TypeFlags.EnumLiteral) !== 0;
}

function isExternalReference(
  node: ts.Expression,
  program: ts.Program,
  externalNames: ReadonlyArray<string | RegExp>
): boolean {
  const typeChecker = program.getTypeChecker();
  const nodeSym = typeChecker.getSymbolAtLocation(node);
  let nodeFrom: ts.Node | undefined = nodeSym?.getDeclarations()?.[0];
  while (nodeFrom) {
    const sourceFileName = nodeFrom.getSourceFile();
    if (externalNames.length === 0) {
      if (/[\\/]node_modules[\\/]/.test(sourceFileName.fileName)) {
        return true;
      }
    } else {
      if (
        externalNames.some((part) => {
          if (typeof part === 'string') {
            return sourceFileName.fileName.replace(/\\/g, '/').includes(part);
          } else {
            return part.test(sourceFileName.fileName);
          }
        })
      ) {
        return true;
      }
    }
    // Walk into the 'import' variables
    if (!ts.isImportSpecifier(nodeFrom)) {
      break;
    }
    const baseName = nodeFrom.propertyName ?? nodeFrom.name;
    const baseSym = typeChecker.getSymbolAtLocation(baseName);
    // We must follow 'aliased' symbol for parsing the symbol which name is not changed from the exported symbol name
    const exportedSym =
      baseSym && baseSym.getFlags() & ts.SymbolFlags.Alias
        ? typeChecker.getAliasedSymbol(baseSym)
        : baseSym;
    nodeFrom = exportedSym?.getDeclarations()?.[0];
  }
  const type = typeChecker.getTypeAtLocation(node);
  const sym = type.getSymbol();
  if (!sym) {
    return false;
  }
  const def = sym.getDeclarations()?.[0];
  if (!def) {
    return false;
  }
  const typeDefinitionSource = def.getSourceFile();
  if (program.isSourceFileFromExternalLibrary(typeDefinitionSource)) {
    return true;
  }
  return false;
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

function hasPureAnnotation(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
  const fullText = node.getFullText(sourceFile);
  const ranges = ts.getLeadingCommentRanges(fullText, 0) ?? [];
  for (const range of ranges) {
    if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }
    const text = fullText.slice(range.pos + 2, range.end - 2).trim();
    if ((text[0] === '@' || text[0] === '#') && text.slice(1) === '__PURE__') {
      return true;
    }
  }
  return false;
}

function getMemberName(m: ts.TypeElement | undefined, tsInstance: typeof ts) {
  if (!m || !m.name) {
    return '';
  }
  const name = m.name;
  if (tsInstance.isIdentifier(name)) {
    return name.escapedText;
  } else if (tsInstance.isPrivateIdentifier(name)) {
    return name.escapedText;
  } else if (tsInstance.isStringLiteral(name)) {
    return name.text;
  } else {
    return '';
  }
}

function isReadonlyPropertyAccess(
  a: ts.PropertyAccessExpression,
  typeChecker: ts.TypeChecker,
  tsInstance: typeof ts
) {
  const ts = tsInstance;
  const type = typeChecker.getTypeAtLocation(a.expression);
  const memberName = a.name.getText();
  if (type.getFlags() & ts.TypeFlags.Object) {
    const dummyTypeNode = typeChecker.typeToTypeNode(
      type,
      a,
      ts.NodeBuilderFlags.NoTruncation
    );
    if (dummyTypeNode && ts.isTypeLiteralNode(dummyTypeNode)) {
      for (let i = 0; i < dummyTypeNode.members.length; ++i) {
        const m = dummyTypeNode.members[i];
        if (
          m &&
          getMemberName(m, ts) === memberName &&
          ts.isPropertySignature(m)
        ) {
          if (
            m.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
          ) {
            return true;
          }
        }
      }
    }
    const prop = type.getProperty(memberName);
    if (prop && prop.declarations && prop.declarations.length > 0) {
      const decl = prop.declarations[0]!;
      if (
        ts.isPropertySignature(decl) &&
        decl.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
      ) {
        return true;
      }
      if (
        ts.isVariableDeclaration(decl) &&
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        decl.parent &&
        ts.isVariableDeclarationList(decl.parent) &&
        decl.parent.flags & ts.NodeFlags.Const
      ) {
        return true;
      }
    }
  }
  return false;
}

function isReadonlyExpression(
  node: ts.Expression,
  program: ts.Program,
  tsInstance: typeof ts
): boolean | null {
  const ts = tsInstance;
  const typeChecker = program.getTypeChecker();
  if (
    ts.isIdentifier(node) &&
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    node.parent &&
    !ts.isPropertyAccessExpression(node.parent)
  ) {
    const nodeSym = typeChecker.getSymbolAtLocation(node);
    if (nodeSym?.valueDeclaration) {
      if (ts.isVariableDeclarationList(nodeSym.valueDeclaration.parent)) {
        if (nodeSym.valueDeclaration.parent.flags & ts.NodeFlags.Const) {
          return true;
        }
        return false;
      }
    }
  }
  if (ts.isPropertyAccessExpression(node)) {
    if (isEnumAccess(node, program, ts)) {
      return true;
    }
    return isReadonlyPropertyAccess(node, typeChecker, ts);
  }
  return null;
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
