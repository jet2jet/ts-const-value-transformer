import * as sourceMap from 'source-map';
import type * as ts from 'typescript';
// for JSDoc
import type createPortalTransformer from './createPortalTransformer.mjs';
import type { ApiProxy, ProxyTypes } from './TsProxy.mjs';

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
  /** Hoist template literals with constant (not including variables). Default is false because it is not necessary for ES2015 or later; Script minifiers would optimize for those values. For ES5 (which will be deprecated in the future), TypeScript converts template literals to such as `''.concat(...)`, which is not treated as constant values. */
  hoistConstTemplateLiteral?: boolean | undefined;
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

type NonNullableTransformOptions = Required<Omit<TransformOptions, 'ts'>>;

interface NodeWithSymbols extends ts.Node {
  [SYMBOL_ORIGINAL_NODE_DATA]?: OriginalNodeDataType;
}

function assignDefaultValues(
  options: Omit<TransformOptions, 'ts'> = {}
): NonNullableTransformOptions {
  return {
    // avoid using spread syntax to override `undefined` (not missing) values
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
    hoistConstTemplateLiteral: options.hoistConstTemplateLiteral ?? false,
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

export function transformSourceWithProxy<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options?: TransformOptions
): ProxyTypes.SourceFile {
  const requiredOptions = assignDefaultValues(options);
  return transformSourceWithProxyImpl(
    sourceFile,
    proxy,
    context,
    requiredOptions
  );
}

// @internal
export function transformSourceWithProxyImpl<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  requiredOptions: NonNullableTransformOptions
): ProxyTypes.SourceFile {
  return proxy.visitEachChild(
    sourceFile,
    (node) =>
      visitNodeChildren(
        node,
        sourceFile,
        sourceFile,
        proxy,
        requiredOptions,
        context,
        (node) => {
          // skip statements which would not have 'value' expressions
          if (
            proxy.isInterfaceDeclaration(node) ||
            proxy.isTypeAliasDeclaration(node) ||
            // Identifies in import clause should not be parsed
            proxy.isImportDeclaration(node) ||
            proxy.isTypeOnlyExportDeclaration(node)
          ) {
            return false;
          }
          return true;
        }
      ),
    context
  );
}

function visitNodeChildren<
  Node extends ProxyTypes.Node,
  TTransformationContext = void,
>(
  node: Node,
  parent: ProxyTypes.Node,
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  options: NonNullableTransformOptions,
  context: TTransformationContext | undefined,
  fnVisit: (node: ProxyTypes.Node, parent: ProxyTypes.Node) => boolean
): Node;
function visitNodeChildren<
  Node extends ProxyTypes.Node,
  VisitContext,
  TTransformationContext = void,
>(
  node: Node,
  parent: ProxyTypes.Node,
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  options: NonNullableTransformOptions,
  context: TTransformationContext | undefined,
  fnVisit: (
    node: ProxyTypes.Node,
    parent: ProxyTypes.Node,
    visitContext: VisitContext
  ) => boolean,
  visitContext: VisitContext,
  fnVisitBeforeReplace: (
    node: ProxyTypes.Node,
    parent: ProxyTypes.Node,
    visitContext: VisitContext
  ) => void,
  fnVisitBeforeChild: (
    node: ProxyTypes.Node,
    parent: ProxyTypes.Node,
    visitContext: VisitContext
  ) => VisitContext,
  fnVisitAfterChild: (
    node: ProxyTypes.Node,
    parent: ProxyTypes.Node,
    childVisitContext: VisitContext
  ) => void,
  fnReplace?: (
    newSource: string,
    originalSource: string,
    oldStart: number,
    oldEnd: number,
    visitContext: VisitContext
  ) => void
): Node;

function visitNodeChildren<
  Node extends ProxyTypes.Node,
  VisitContext,
  TTransformationContext = void,
>(
  node: Node,
  parent: ProxyTypes.Node,
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  options: NonNullableTransformOptions,
  context: TTransformationContext | undefined,
  fnVisit: (
    node: ProxyTypes.Node,
    parent: ProxyTypes.Node,
    visitContext: VisitContext
  ) => boolean,
  visitContext?: VisitContext,
  fnVisitBeforeReplace?:
    | ((
        node: ProxyTypes.Node,
        parent: ProxyTypes.Node,
        visitContext: VisitContext
      ) => void)
    | null,
  fnVisitBeforeChild?:
    | ((
        node: ProxyTypes.Node,
        parent: ProxyTypes.Node,
        visitContext: VisitContext
      ) => VisitContext)
    | null,
  fnVisitAfterChild?:
    | ((
        node: ProxyTypes.Node,
        parent: ProxyTypes.Node,
        childVisitContext: VisitContext
      ) => void)
    | null,
  fnReplace?: (
    newSource: string,
    originalSource: string,
    oldStart: number,
    oldEnd: number,
    visitContext: VisitContext
  ) => void
): Node {
  if (fnVisitBeforeReplace) {
    fnVisitBeforeReplace(node, parent, visitContext!);
  }
  const newNode = visitNodeAndReplaceIfNeeded(
    node,
    parent,
    sourceFile,
    proxy,
    options,
    context,
    visitContext!,
    fnReplace ?? 'create'
  );
  if (newNode == null) {
    return node;
  }
  if (newNode !== node) {
    return newNode as Node;
  }

  if (!fnVisit(node, parent, visitContext!)) {
    return node;
  }

  const childVisitContext = fnVisitBeforeChild
    ? fnVisitBeforeChild(node, parent, visitContext!)
    : visitContext;
  const r = proxy.visitEachChild(
    node,
    (nodeChild) =>
      visitNodeChildren(
        nodeChild,
        node,
        sourceFile,
        proxy,
        options,
        context,
        fnVisit,
        childVisitContext!,
        fnVisitBeforeReplace!,
        fnVisitBeforeChild!,
        fnVisitAfterChild!,
        fnReplace
      ),
    context
  );
  if (fnVisitAfterChild) {
    fnVisitAfterChild(node, parent, childVisitContext!);
  }
  return r;
}

function visitNodeAndReplaceIfNeeded<
  VisitContext,
  TTransformationContext = void,
>(
  node: ProxyTypes.Node,
  parent: ProxyTypes.Node,
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  options: NonNullableTransformOptions,
  context: TTransformationContext | undefined,
  visitContext: VisitContext,
  replaceOption:
    | 'create'
    | ((
        newSource: string,
        originalSource: string,
        oldStart: number,
        oldEnd: number,
        visitContext: VisitContext
      ) => void)
): ProxyTypes.Node | undefined {
  if (proxy.isCallLikeExpression(node)) {
    if (
      !proxy.isExpression(node) ||
      (!options.unsafeHoistFunctionCall &&
        (!options.hoistPureFunctionCall ||
          !proxy.hasPureAnnotation(node, sourceFile)))
    ) {
      return node;
    }
  } else if (proxy.isIdentifier(node)) {
    if (
      !proxy.isComputedPropertyName(parent) &&
      ((!proxy.isExpression(parent) &&
        (!('initializer' in parent) || node !== parent.initializer)) ||
        (proxy.isPropertyAccessExpression(parent) && node === parent.name))
    ) {
      return node;
    }
    if (!options.hoistEnumValues && proxy.isEnumIdentifier(node, sourceFile)) {
      return node;
    }
    if (
      !options.hoistUndefinedSymbol &&
      proxy.isUndefinedIdentifier(node, parent, sourceFile)
    ) {
      return node;
    }
  } else if (
    proxy.isPropertyAccessExpression(node) ||
    proxy.isElementAccessExpression(node)
  ) {
    if (!proxy.isHoistablePropertyAccess(node, sourceFile)) {
      return node;
    }
    if (
      (!options.hoistProperty && !proxy.isEnumAccess(node, sourceFile)) ||
      (!options.hoistEnumValues &&
        (proxy.isEnumAccess(node, sourceFile) ||
          (proxy.isIdentifier(node) &&
            proxy.isEnumIdentifier(node, sourceFile))))
    ) {
      return node;
    }
  } else if (proxy.isAsExpression(node)) {
    if (!options.unsafeHoistAsExpresion) {
      return node;
    }
  } else if (proxy.isTemplateExpression(node)) {
    if (!options.hoistConstTemplateLiteral) {
      return node;
    }
  } else {
    return node;
  }

  if (
    !options.hoistExternalValues &&
    proxy.isExternalReference(node, options.externalNames, sourceFile)
  ) {
    return node;
  }

  if (
    !options.unsafeHoistAsExpresion &&
    hasAsExpression(node, proxy, context)
  ) {
    return node;
  }

  if (!options.unsafeHoistWritableValues) {
    const r = proxy.isReadonlyExpression(node, sourceFile);
    if (r === false) {
      return node;
    }
  }

  try {
    const type = proxy.getTypeAtLocation(node, sourceFile);
    let newNode: ProxyTypes.Expression | undefined;
    if (!type) {
      return node;
    }
    let newSource: string;
    if (proxy.isStringLiteral(type)) {
      if (replaceOption === 'create' && proxy.factory) {
        newNode = proxy.factory.createStringLiteral(type.value);
      }
      newSource = proxy.makeStringLiteralSource(type.value);
    } else if (proxy.isNumberLiteral(type)) {
      if (type.value < 0) {
        if (replaceOption === 'create' && proxy.factory) {
          newNode = proxy.factory.createParenthesizedExpression(
            proxy.factory.createExpressionWithMinusToken(
              proxy.factory.createNumericLiteral(-type.value)
            )
          );
        }
        newSource = `(-${-type.value})`;
      } else {
        if (replaceOption === 'create' && proxy.factory) {
          newNode = proxy.factory.createNumericLiteral(type.value);
        }
        newSource = `${type.value}`;
      }
    } else if (proxy.isBigIntLiteral(type)) {
      const text = proxy.typeToString(type);
      if (replaceOption === 'create' && proxy.factory) {
        newNode = proxy.factory.createBigIntLiteral(text);
      }
      newSource = text;
    } else if (proxy.isBooleanLiteral(type)) {
      const text = proxy.typeToString(type);
      if (replaceOption === 'create' && proxy.factory) {
        newNode =
          text === 'true'
            ? proxy.factory.createTrue()
            : proxy.factory.createFalse();
      }
      newSource = text;
    } else if (proxy.isNullType(type)) {
      if (replaceOption === 'create' && proxy.factory) {
        newNode = proxy.factory.createNull();
      }
      newSource = 'null';
    } else if (proxy.isUndefinedType(type)) {
      if (options.useUndefinedSymbolForUndefinedValue) {
        if (replaceOption === 'create' && proxy.factory) {
          newNode = proxy.factory.createIdentifier('undefined');
        }
        newSource = 'undefined';
      } else {
        if (replaceOption === 'create' && proxy.factory) {
          newNode = proxy.factory.createParenthesizedExpression(
            proxy.factory.createVoidZero()
          );
        }
        newSource = '(void 0)';
      }
    } else {
      return node;
    }

    const originalSource = proxy.getNodeText(node, sourceFile);
    const comment = ` ${originalSource.replace(/\/\*/g, ' *').replace(/\*\//g, '* ')} `;
    let result = newNode
      ? proxy.appendMultiLineComment(newNode, comment)
      : undefined;
    newSource = `${newSource} /*${comment}*/`;
    if (/[\r\n]/m.test(originalSource)) {
      if (result && proxy.factory) {
        result = proxy.factory.createParenthesizedExpression(result);
      }
      newSource = `(${newSource})`;
    }
    if (result) {
      proxy.setTextRange(result, node);
      (result as NodeWithSymbols)[SYMBOL_ORIGINAL_NODE_DATA] = [
        originalSource,
        newSource,
        node.pos,
        node.end,
      ];
    }
    if (replaceOption !== 'create') {
      replaceOption(
        newSource,
        originalSource,
        node.pos,
        node.end,
        visitContext
      );
    }
    return result;
  } catch {
    return node;
  }
}

function hasAsExpression<TTransformationContext = void>(
  node: ProxyTypes.Node,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined
): boolean {
  // including 'as const'
  if (proxy.isAsExpression(node)) {
    return true;
  }
  let found = false;
  proxy.visitEachChild(
    node,
    (node) => {
      if (!found) {
        found = hasAsExpression(node, proxy, context);
      }
      return node;
    },
    context
  );
  return found;
}

////////////////////////////////////////////////////////////////////////////////

export function printSourceWithProxy<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>
): string {
  return printSourceImpl(proxy, sourceFile)[0];
}

export function printSourceWithMapWithProxy<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  originalSourceName: string,
  proxy: ApiProxy<TTransformationContext>,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const generator = new sourceMap.SourceMapGenerator(startOfSourceMap);
  generator.setSourceContent(originalSourceName, sourceFile.text);
  return printSourceImpl(proxy, sourceFile, originalSourceName, generator);
}

interface PositionContext {
  /** original pos */
  pos: number;
  /** generated diff */
  diff: number;
  lastLine: number;
}

function positionToLineAndColumn<TTransformationContext = void>(
  proxy: ApiProxy<TTransformationContext>,
  sourceFile: ProxyTypes.SourceFile,
  pos: number,
  generatedDiff: number
): sourceMap.Position {
  let line = 0;
  let lastLinePos = 0;
  for (const linePos of proxy.getLineStarts(sourceFile)) {
    if (pos < linePos) {
      break;
    }
    lastLinePos = linePos;
    ++line;
  }
  return { line, column: pos - lastLinePos + generatedDiff };
}

function printSourceImpl<TTransformationContext = void>(
  proxy: ApiProxy<TTransformationContext>,
  sourceFile: ProxyTypes.SourceFile
): [string];
function printSourceImpl<TTransformationContext = void>(
  proxy: ApiProxy<TTransformationContext>,
  sourceFile: ProxyTypes.SourceFile,
  originalSourceName: string,
  mapGenerator: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap];

function printSourceImpl<TTransformationContext = void>(
  proxy: ApiProxy<TTransformationContext>,
  sourceFile: ProxyTypes.SourceFile,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap?] {
  const r = printNode(
    proxy,
    sourceFile.text,
    sourceFile,
    sourceFile,
    { pos: 0, diff: 0, lastLine: 0 },
    originalSourceName,
    mapGenerator
  );
  return [r, mapGenerator?.toJSON()];
}

function printNode<TTransformationContext = void>(
  proxy: ApiProxy<TTransformationContext>,
  baseSource: string,
  sourceFile: ProxyTypes.SourceFile,
  node: ProxyTypes.Node,
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

    posContext.pos = node.pos + leadingUnchanged;
    addMappingForCurrent(old);
    posContext.diff += result.length - old.length;
    posContext.pos += old.length;
    addMappingForCurrent();
    posContext.pos = node.end;
    return newText;
  }
  let output = '';
  let headPrinted = false;
  let lastChildPos = 0;
  proxy.visitEachChild(
    node,
    (child) => {
      if (!headPrinted) {
        headPrinted = true;
        if (child.pos > node.pos) {
          const text = baseSource.substring(node.pos, child.pos);
          output += text;
          posContext.pos = child.pos;
        }
      } else if (child.pos > lastChildPos) {
        const text = baseSource.substring(lastChildPos, child.pos);
        output += text;
        posContext.pos = child.pos;
      }
      output += printNode(
        proxy,
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
    posContext.pos = node.end;
  } else if (lastChildPos < node.end) {
    const text = baseSource.substring(lastChildPos, node.end);
    output += text;
    posContext.pos = node.end;
  }
  return output;

  function addMappingForCurrent(name?: string) {
    const original = positionToLineAndColumn(
      proxy,
      sourceFile,
      posContext.pos,
      0
    );
    if (original.line !== posContext.lastLine) {
      posContext.diff = 0;
      posContext.lastLine = original.line;
    }
    if (mapGenerator) {
      mapGenerator.addMapping({
        original,
        generated: positionToLineAndColumn(
          proxy,
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

////////////////////////////////////////////////////////////////////////////////

export function transformAndPrintSourceWithProxy<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options?: TransformOptions
): string {
  return transformAndPrintSourceImpl(sourceFile, proxy, context, options)[0];
}

export function transformAndPrintSourceWithMapWithProxy<
  TTransformationContext = void,
>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  originalSourceName: string,
  options?: TransformOptions,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const generator = new sourceMap.SourceMapGenerator(startOfSourceMap);
  return transformAndPrintSourceImpl(
    sourceFile,
    proxy,
    context,
    options,
    originalSourceName,
    generator
  );
}

function transformAndPrintSourceImpl<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options?: TransformOptions
): [string, sourceMap.RawSourceMap?];
function transformAndPrintSourceImpl<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options: TransformOptions | undefined,
  originalSourceName: string,
  mapGenerator: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap];

function transformAndPrintSourceImpl<TTransformationContext = void>(
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options?: TransformOptions,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): [string, sourceMap.RawSourceMap?] {
  const requiredOptions = assignDefaultValues(options);
  if (mapGenerator) {
    mapGenerator.setSourceContent(originalSourceName!, sourceFile.text);
  }
  const r = transformAndPrintNode(
    { pos: 0, diff: 0, lastLine: 0 },
    sourceFile.text,
    sourceFile,
    proxy,
    context,
    requiredOptions,
    originalSourceName,
    mapGenerator
  );
  return [r, mapGenerator?.toJSON()];
}

interface TransformAndPrintNodeVisitContext {
  headPrinted: boolean;
  lastChildPos: number;
}

function transformAndPrintNode<TTransformationContext = void>(
  posContext: PositionContext,
  baseSource: string,
  sourceFile: ProxyTypes.SourceFile,
  proxy: ApiProxy<TTransformationContext>,
  context: TTransformationContext | undefined,
  options: NonNullableTransformOptions,
  originalSourceName?: string,
  mapGenerator?: sourceMap.SourceMapGenerator
): string {
  let output = '';
  visitNodeChildren<
    ProxyTypes.Node,
    TransformAndPrintNodeVisitContext,
    TTransformationContext
  >(
    sourceFile,
    sourceFile,
    sourceFile,
    proxy,
    options,
    context,
    // fnVisit
    (child, _parent, visitContext) => {
      visitContext.lastChildPos = child.end;
      return true;
    },
    // visitContext
    {
      headPrinted: false,
      lastChildPos: 0,
    },
    // fnVisitBeforeReplace
    (child, parent, visitContext) => {
      if (!visitContext.headPrinted) {
        visitContext.headPrinted = true;
        if (child.pos > parent.pos) {
          const text = baseSource.substring(parent.pos, child.pos);
          output += text;
          posContext.pos = child.pos;
        }
      } else if (child.pos > visitContext.lastChildPos) {
        const text = baseSource.substring(visitContext.lastChildPos, child.pos);
        output += text;
        posContext.pos = child.pos;
      }
    },
    // fnVisitBeforeChild
    (): TransformAndPrintNodeVisitContext => {
      return {
        headPrinted: false,
        lastChildPos: 0,
      };
    },
    // fnVisitAfterChild
    (node, _parent, childVisitContext) => {
      if (!childVisitContext.headPrinted) {
        output += baseSource.substring(node.pos, node.end);
        posContext.pos = node.end;
      } else if (childVisitContext.lastChildPos < node.end) {
        const text = baseSource.substring(
          childVisitContext.lastChildPos,
          node.end
        );
        output += text;
        posContext.pos = node.end;
      }
    },
    // fnReplace
    (newSource, originalSource, pos, end, visitContext) => {
      const oldFull = baseSource.substring(pos, end);
      const i = oldFull.lastIndexOf(originalSource);
      const leadingUnchanged = i < 0 ? 0 : i;
      const newText =
        i < 0
          ? newSource
          : oldFull.substring(0, i) +
            newSource +
            oldFull.substring(i + originalSource.length);

      posContext.pos = pos + leadingUnchanged;
      addMappingForCurrent(originalSource);
      posContext.diff += newSource.length - originalSource.length;
      posContext.pos += originalSource.length;
      addMappingForCurrent();
      posContext.pos = end;

      output += newText;
      visitContext.lastChildPos = end;
    }
  );
  return output;

  function addMappingForCurrent(name?: string) {
    const original = positionToLineAndColumn(
      proxy,
      sourceFile,
      posContext.pos,
      0
    );
    if (original.line !== posContext.lastLine) {
      posContext.diff = 0;
      posContext.lastLine = original.line;
    }
    if (mapGenerator) {
      mapGenerator.addMapping({
        original,
        generated: positionToLineAndColumn(
          proxy,
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
