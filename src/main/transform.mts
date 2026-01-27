import * as sourceMap from 'source-map';
import * as tsNamespace from 'typescript';
import type * as ts from 'typescript';
// for JSDoc
import type createPortalTransformer from './createPortalTransformer.mjs';

type OriginalNodeDataType = [
  text: string,
  newText: string,
  pos: number,
  end: number,
];
const SYMBOL_ORIGINAL_NODE_DATA = Symbol('originalNodeData');

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
  /** Uses `undefined` symbol for `undefined` type values. Default is false and replaces to `void 0`. */
  useUndefinedSymbolForUndefinedValue?: boolean | undefined;
  /** Hoist `undefined` symbol to `void 0` (or `undefined` if {@linkcode useUndefinedSymbolForUndefinedValue} is true). Default is true. */
  hoistUndefinedSymbol?: boolean | undefined;
  /**
   * External names (tested with `.includes()` for string, with `.test()` for RegExp) for `hoistExternalValues` settings (If `hoistExternalValues` is not specified, this setting will be used).
   * - Path separators for input file name are always normalized to '/' internally.
   * - Default is `['/node_modules/']`.
   */
  externalNames?: ReadonlyArray<string | RegExp> | undefined;
  /**
   * Specifies for file name list or function to skip transformation. This option is used by webpack loader, the transformed called from ts-loader, and {@link createPortalTransformer} only.
   * - For list, if the token is `string`, the transformation will be skipped if `fileName.indexOf(token) >= 0` is true.
   *   If the token is `RegExp`, the transformation will be skipped if `fileName.indexOf(token) >= 0` is true.
   * - For function, the transformation will be skipped if `fn(fileName)` is true.
   */
  ignoreFiles?:
    | ReadonlyArray<string | RegExp>
    | ((fileName: string) => boolean);
}

type NonNullableTransformOptions = Required<TransformOptions>;

interface NodeWithSymbols extends ts.Node {
  [SYMBOL_ORIGINAL_NODE_DATA]?: OriginalNodeDataType;
}

function assignDefaultValues(
  options: TransformOptions = {}
): NonNullableTransformOptions {
  return {
    // avoid using spread syntax to override `undefined` (not missing) values
    ts: options.ts ?? tsNamespace,
    hoistProperty: options.hoistProperty ?? true,
    hoistEnumValues: options.hoistEnumValues ?? true,
    hoistExternalValues: options.hoistExternalValues ?? true,
    unsafeHoistAsExpresion: options.unsafeHoistAsExpresion ?? false,
    hoistPureFunctionCall: options.hoistPureFunctionCall ?? false,
    unsafeHoistFunctionCall: options.unsafeHoistFunctionCall ?? false,
    unsafeHoistWritableValues: options.unsafeHoistWritableValues ?? false,
    useUndefinedSymbolForUndefinedValue:
      options.useUndefinedSymbolForUndefinedValue ?? false,
    hoistUndefinedSymbol: options.hoistUndefinedSymbol ?? true,
    externalNames: options.externalNames ?? [],
    ignoreFiles: options.ignoreFiles ?? [],
  };
}

////////////////////////////////////////////////////////////////////////////////

export function getIgnoreFilesFunction(
  ignoreFiles: TransformOptions['ignoreFiles']
): (fileName: string) => boolean {
  if (!ignoreFiles) {
    return () => false;
  }
  if (typeof ignoreFiles === 'function') {
    return ignoreFiles;
  }
  const a = ignoreFiles;
  return (fileName: string) => {
    return a.some((t) => {
      if (typeof t === 'string') {
        return fileName.indexOf(t) >= 0;
      } else {
        return t.test(fileName);
      }
    });
  };
}

////////////////////////////////////////////////////////////////////////////////

export function transformSource(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext | undefined,
  options?: TransformOptions
): ts.SourceFile {
  const requiredOptions = assignDefaultValues(options);
  return requiredOptions.ts.visitEachChild(
    sourceFile,
    (node) =>
      visitNodeChildren(
        node,
        sourceFile,
        sourceFile,
        program,
        requiredOptions,
        context
      ),
    context
  );
}

function visitNodeChildren(
  node: ts.SourceFile,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.SourceFile;
function visitNodeChildren(
  node: ts.Node,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.Node;

function visitNodeChildren(
  node: ts.Node,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.Node {
  const ts = options.ts;
  const newNode = visitNodeAndReplaceIfNeeded(
    node,
    parent,
    sourceFile,
    program,
    options,
    context
  );
  if ((newNode as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE_DATA]) {
    return newNode;
  }

  // skip statements which would not have 'value' expressions
  if (
    ts.isInterfaceDeclaration(newNode) ||
    ts.isTypeAliasDeclaration(newNode) ||
    // Identifies in import clause should not be parsed
    ts.isImportDeclaration(newNode) ||
    ts.isTypeOnlyExportDeclaration(newNode)
  ) {
    return newNode;
  }

  return ts.visitEachChild(
    newNode,
    (node) =>
      visitNodeChildren(node, newNode, sourceFile, program, options, context),
    context
  );
}

function visitNodeAndReplaceIfNeeded(
  node: ts.SourceFile,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.SourceFile;
function visitNodeAndReplaceIfNeeded(
  node: ts.Node,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.Node;

function visitNodeAndReplaceIfNeeded(
  node: ts.Node,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  options: NonNullableTransformOptions,
  context: ts.TransformationContext | undefined
): ts.Node {
  const ts = options.ts;
  if (ts.isCallLikeExpression(node)) {
    if (
      !ts.isExpression(node) ||
      (!options.unsafeHoistFunctionCall &&
        (!options.hoistPureFunctionCall ||
          !hasPureAnnotation(node, sourceFile, ts)))
    ) {
      return node;
    }
  } else if (ts.isIdentifier(node)) {
    if (
      !ts.isComputedPropertyName(parent) &&
      ((!ts.isExpression(parent) &&
        (!('initializer' in parent) || node !== parent.initializer)) ||
        (ts.isPropertyAccessExpression(parent) && node === parent.name))
    ) {
      return node;
    }
    if (!options.hoistEnumValues && isEnumIdentifier(node, program, ts)) {
      return node;
    }
    if (
      !options.hoistUndefinedSymbol &&
      isUndefinedIdentifier(node, parent, program, ts)
    ) {
      return node;
    }
  } else if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    if (!isHoistablePropertyAccess(node, program, ts)) {
      return node;
    }
    if (
      (!options.hoistProperty && !isEnumAccess(node, program, ts)) ||
      (!options.hoistEnumValues &&
        (isEnumAccess(node, program, ts) ||
          (ts.isIdentifier(node) && isEnumIdentifier(node, program, ts))))
    ) {
      return node;
    }
  } else if (ts.isAsExpression(node)) {
    if (!options.unsafeHoistAsExpresion) {
      return node;
    }
  } else {
    return node;
  }

  if (
    !options.hoistExternalValues &&
    isExternalReference(node, program, options.externalNames, ts)
  ) {
    return node;
  }

  if (!options.unsafeHoistAsExpresion && hasAsExpression(node, ts, context)) {
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
    let newNode: ts.Expression;
    if (type.isUnionOrIntersection()) {
      return node;
    }
    let newSource: string;
    if (type.isStringLiteral()) {
      newNode = ts.factory.createStringLiteral(type.value);
      newSource =
        // TypeScript namespace may export `function escapeNonAsciiString(s: string, quoteChar?: CharacterCodes.doubleQuote | CharacterCodes.singleQuote | CharacterCodes.backtick): string`
        'escapeNonAsciiString' in ts
          ? `"${(
              ts.escapeNonAsciiString as (
                s: string,
                quoteChar: number
              ) => string
            )(
              type.value,
              'CharacterCodes' in ts
                ? (ts.CharacterCodes as { doubleQuote: number }).doubleQuote
                : 34 /* doubleQuote */
            )}"`
          : JSON.stringify(type.value);
    } else if (type.isNumberLiteral()) {
      if (type.value < 0) {
        newNode = ts.factory.createParenthesizedExpression(
          ts.factory.createPrefixUnaryExpression(
            ts.SyntaxKind.MinusToken,
            ts.factory.createNumericLiteral(-type.value)
          )
        );
        newSource = `(-${-type.value})`;
      } else {
        newNode = ts.factory.createNumericLiteral(type.value);
        newSource = `${type.value}`;
      }
    } else if (flags & ts.TypeFlags.BigIntLiteral) {
      const text = typeChecker.typeToString(type);
      newNode = ts.factory.createBigIntLiteral(text);
      newSource = text;
    } else if (flags & ts.TypeFlags.BooleanLiteral) {
      const text = typeChecker.typeToString(type);
      newNode =
        text === 'true' ? ts.factory.createTrue() : ts.factory.createFalse();
      newSource = text;
    } else if (flags & ts.TypeFlags.Null) {
      newNode = ts.factory.createNull();
      newSource = 'null';
    } else if (flags & ts.TypeFlags.Undefined) {
      if (options.useUndefinedSymbolForUndefinedValue) {
        newNode = ts.factory.createIdentifier('undefined');
        newSource = 'undefined';
      } else {
        newNode = ts.factory.createParenthesizedExpression(
          ts.factory.createVoidZero()
        );
        newSource = '(void 0)';
      }
    } else {
      return node;
    }

    const originalSource = node.getText(sourceFile);
    const comment = ` ${originalSource.replace(/\/\*/g, ' *').replace(/\*\//g, '* ')} `;
    let result = ts.addSyntheticTrailingComment(
      newNode,
      ts.SyntaxKind.MultiLineCommentTrivia,
      comment
    );
    newSource = `${newSource} /*${comment}*/`;
    if (/[\r\n]/m.test(originalSource)) {
      result = ts.factory.createParenthesizedExpression(result);
      newSource = `(${newSource})`;
    }
    ts.setTextRange(result, node);
    (result as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE_DATA] = [
      originalSource,
      newSource,
      node.pos,
      node.end,
    ];
    return result;
  } catch {
    return node;
  }
}

function isEnumAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
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
  node: ts.Node,
  program: ts.Program,
  externalNames: ReadonlyArray<string | RegExp>,
  tsInstance: typeof ts
): boolean {
  const ts = tsInstance;
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

function hasAsExpression(
  node: ts.Node,
  tsInstance: typeof ts,
  context: ts.TransformationContext | undefined
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
        found = hasAsExpression(node, ts, context);
      }
      return node;
    },
    context
  );
  return found;
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

function getNameFromElementAccessExpression(
  node: ts.ElementAccessExpression,
  typeChecker: ts.TypeChecker
) {
  const type = typeChecker.getTypeAtLocation(node.argumentExpression);
  if (type.isStringLiteral() || type.isNumberLiteral()) {
    return `${type.value}`;
  }
  return null;
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
  a: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  typeChecker: ts.TypeChecker,
  tsInstance: typeof ts
) {
  const ts = tsInstance;
  const type = typeChecker.getTypeAtLocation(a.expression);
  const memberName = ts.isPropertyAccessExpression(a)
    ? a.name.getText()
    : getNameFromElementAccessExpression(a, typeChecker);
  if (memberName == null) {
    return false;
  }
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
  node: ts.Node,
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
  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    if (isEnumAccess(node, program, ts)) {
      return true;
    }
    return isReadonlyPropertyAccess(node, typeChecker, ts);
  }
  return null;
}

function isHoistablePropertyAccess(
  a: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  program: ts.Program,
  tsInstance: typeof ts
) {
  const ts = tsInstance;
  const typeChecker = program.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(a.expression);
  const memberName = ts.isPropertyAccessExpression(a)
    ? a.name.getText()
    : getNameFromElementAccessExpression(a, typeChecker);
  if (memberName == null) {
    return false;
  }
  if (type.getFlags() & ts.TypeFlags.Object) {
    const prop = type.getProperty(memberName);
    // If the property access uses indexed access, `prop` will be undefined
    if (prop) {
      return true;
    }
  }
  return false;
}

function isUndefinedIdentifier(
  node: ts.Identifier,
  parent: ts.Node,
  program: ts.Program,
  tsInstance: typeof ts
): boolean {
  if (
    tsInstance.isPropertyAccessExpression(parent) ||
    tsInstance.isElementAccessExpression(parent)
  ) {
    return false;
  }
  const typeChecker = program.getTypeChecker();
  const type = typeChecker.getTypeAtLocation(node);
  const sym = typeChecker.getSymbolAtLocation(node);
  if (!sym || sym.getEscapedName().toString() !== 'undefined') {
    return false;
  }
  if (
    type.isUnionOrIntersection() ||
    !(type.getFlags() & tsInstance.TypeFlags.Undefined)
  ) {
    return false;
  }
  return true;
}

////////////////////////////////////////////////////////////////////////////////

export function printSource(
  sourceFile: ts.SourceFile,
  tsInstance?: typeof ts
): string {
  return printSourceImpl(tsInstance, sourceFile)[0];
}

export function printSourceWithMap(
  sourceFile: ts.SourceFile,
  originalSourceName: string,
  startOfSourceMap?: sourceMap.RawSourceMap,
  tsInstance?: typeof ts
): [string, sourceMap.RawSourceMap] {
  const generator = new sourceMap.SourceMapGenerator(startOfSourceMap);
  generator.setSourceContent(originalSourceName, sourceFile.getFullText());
  return printSourceImpl(tsInstance, sourceFile, originalSourceName, generator);
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

function printSourceImpl(
  tsInstance: typeof ts | null | undefined,
  sourceFile: ts.SourceFile
): [string];
function printSourceImpl(
  tsInstance: typeof ts | null | undefined,
  sourceFile: ts.SourceFile,
  originalSourceName: string,
  mapGenerator: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap];

function printSourceImpl(
  tsInstance: typeof ts | null | undefined,
  sourceFile: ts.SourceFile,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap?] {
  const ts = tsInstance ?? tsNamespace;
  const r = printNode(
    ts,
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
  tsInstance: typeof ts,
  baseSource: string,
  sourceFile: ts.SourceFile,
  node: ts.Node,
  posContext: PositionContext,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): string {
  const originalNodeData = (node as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE_DATA];
  if (originalNodeData) {
    const result = originalNodeData[1];
    const old = originalNodeData[0];
    const oldFull = baseSource.substring(
      originalNodeData[2],
      originalNodeData[3]
    );
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
  tsInstance.visitEachChild(
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
        tsInstance,
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
