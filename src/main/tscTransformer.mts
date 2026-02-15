import type * as sourceMap from 'source-map';
import type * as ts from 'typescript';
import * as tsNamespace from 'typescript';
import {
  printSourceWithMapWithProxy,
  printSourceWithProxy,
  transformAndPrintSourceWithMapWithProxy,
  transformAndPrintSourceWithProxy,
  transformSourceWithProxy,
  type TransformOptions,
} from './transform.mjs';
import type { ApiProxy, ProxyTypes } from './TsProxy.mjs';

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

function makeTscProxy(
  tsInstance: typeof ts,
  program: ts.Program | null
): ApiProxy<ts.TransformationContext> {
  const typeChecker = program && program.getTypeChecker();

  const isEnumAccess = (
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression
  ) => {
    if (!typeChecker) {
      return false;
    }
    const type = typeChecker.getTypeAtLocation(node);
    return (type.getFlags() & tsInstance.TypeFlags.EnumLiteral) !== 0;
  };
  const isReadonlyPropertyAccess = (
    node: ts.PropertyAccessExpression | ts.ElementAccessExpression
  ): boolean => {
    if (!typeChecker) {
      return false;
    }
    const type = typeChecker.getTypeAtLocation(node.expression);
    const memberName = tsInstance.isPropertyAccessExpression(node)
      ? node.name.getText()
      : getNameFromElementAccessExpression(node, typeChecker);
    if (memberName == null) {
      return false;
    }
    if (type.getFlags() & tsInstance.TypeFlags.Object) {
      const prop = type.getProperty(memberName);
      if (prop) {
        // Use internal but exported function to improve memory performance
        if (
          'getCheckFlags' in tsInstance &&
          'CheckFlags' in tsInstance &&
          (tsInstance.CheckFlags as Record<string, number>).Readonly != null
        ) {
          const checkFlags = (
            tsInstance.getCheckFlags as (symbol: ts.Symbol) => number
          )(prop);
          if (
            checkFlags &
            (tsInstance.CheckFlags as Record<string, number>).Readonly!
          ) {
            return true;
          }
        }
        if ('getDeclarationModifierFlagsFromSymbol' in tsInstance) {
          const modifierFlags = (
            tsInstance.getDeclarationModifierFlagsFromSymbol as (
              s: ts.Symbol,
              isWrite?: boolean
            ) => ts.ModifierFlags
          )(prop);
          if (modifierFlags & tsInstance.ModifierFlags.Readonly) {
            return true;
          }
        }

        if (prop.declarations && prop.declarations.length > 0) {
          const decl = prop.declarations[0]!;
          if (
            tsInstance.isPropertySignature(decl) &&
            decl.modifiers?.some(
              (m) => m.kind === tsInstance.SyntaxKind.ReadonlyKeyword
            )
          ) {
            return true;
          }
          if (
            tsInstance.isVariableDeclaration(decl) &&
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            decl.parent &&
            tsInstance.isVariableDeclarationList(decl.parent) &&
            decl.parent.flags & tsInstance.NodeFlags.Const
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  return {
    visitEachChild<T extends ProxyTypes.Node>(
      node: T,
      visitor: (
        node: ProxyTypes.Node
      ) => ProxyTypes.Node | readonly ProxyTypes.Node[] | undefined,
      context: ts.TransformationContext | undefined
    ): T {
      return tsInstance.visitEachChild(
        node as ProxyTypes.Node as ts.Node,
        visitor as ts.Visitor,
        context
      ) as ProxyTypes.Node as T;
    },
    getNodeText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return (node as ts.Node).getText(sourceFile as ts.SourceFile);
    },
    getNodeFullText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return (node as ts.Node).getFullText(sourceFile as ts.SourceFile);
    },
    appendMultiLineComment<Node extends ProxyTypes.Node>(
      node: Node,
      comment: string
    ): Node {
      return tsInstance.addSyntheticTrailingComment(
        node as ProxyTypes.Node as ts.Node,
        tsInstance.SyntaxKind.MultiLineCommentTrivia,
        comment
      ) as ProxyTypes.Node as Node;
    },
    setTextRange<T extends ProxyTypes.TextRange>(
      range: T,
      location: ProxyTypes.TextRange | undefined
    ): T {
      return tsInstance.setTextRange(range, location);
    },
    isExpression(node: ProxyTypes.Node): node is ProxyTypes.Expression {
      return tsInstance.isExpression(node as ts.Node);
    },
    isAsExpression(node: ProxyTypes.Node): boolean {
      return tsInstance.isAsExpression(node as ts.Node);
    },
    isCallLikeExpression(node: ProxyTypes.Node): boolean {
      return tsInstance.isCallLikeExpression(node as ts.Node);
    },
    isTemplateExpression(node: ProxyTypes.Node): boolean {
      return tsInstance.isTemplateExpression(node as ts.Node);
    },
    isPropertyAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.PropertyAccessExpression {
      return tsInstance.isPropertyAccessExpression(node as ts.Node);
    },
    isElementAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.ElementAccessExpression {
      return tsInstance.isElementAccessExpression(node as ts.Node);
    },
    isInterfaceDeclaration(node: ProxyTypes.Node): boolean {
      return tsInstance.isInterfaceDeclaration(node as ts.Node);
    },
    isTypeAliasDeclaration(node: ProxyTypes.Node): boolean {
      return tsInstance.isTypeAliasDeclaration(node as ts.Node);
    },
    isImportDeclaration(node: ProxyTypes.Node): boolean {
      return tsInstance.isImportDeclaration(node as ts.Node);
    },
    isTypeOnlyExportDeclaration(node: ProxyTypes.Node): boolean {
      return tsInstance.isTypeOnlyExportDeclaration(node as ts.Node);
    },
    isIdentifier(node: ProxyTypes.Node): node is ProxyTypes.Identifier {
      return tsInstance.isIdentifier(node as ts.Node);
    },
    isComputedPropertyName(node: ProxyTypes.Node): boolean {
      return tsInstance.isComputedPropertyName(node as ts.Node);
    },

    getTypeAtLocation(node: ProxyTypes.Node): ProxyTypes.Type | undefined {
      return typeChecker?.getTypeAtLocation(node as ts.Node);
    },
    isEnumLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts.Type).getFlags() & tsInstance.TypeFlags.EnumLiteral) !== 0
      );
    },
    isStringLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.StringLiteralType {
      return (type as ts.Type).isStringLiteral();
    },
    isNumberLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.NumberLiteralType {
      return (type as ts.Type).isNumberLiteral();
    },
    isBigIntLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts.Type).getFlags() & tsInstance.TypeFlags.BigIntLiteral) !==
        0
      );
    },
    isBooleanLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts.Type).getFlags() & tsInstance.TypeFlags.BooleanLiteral) !==
        0
      );
    },
    isNullType(type: ProxyTypes.Type): boolean {
      return ((type as ts.Type).getFlags() & tsInstance.TypeFlags.Null) !== 0;
    },
    isUndefinedType(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts.Type).getFlags() & tsInstance.TypeFlags.Undefined) !== 0
      );
    },
    typeToString(type: ProxyTypes.Type): string {
      return typeChecker?.typeToString(type as ts.Type) ?? '';
    },

    factory: {
      createIdentifier(text: string): ProxyTypes.Identifier {
        return tsInstance.factory.createIdentifier(text);
      },
      createStringLiteral(value: string): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createStringLiteral(value);
      },
      createNumericLiteral(
        value: number | string
      ): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createNumericLiteral(value);
      },
      createExpressionWithMinusToken(
        operand: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return tsInstance.factory.createPrefixUnaryExpression(
          tsInstance.SyntaxKind.MinusToken,
          operand as ts.Expression
        );
      },
      createBigIntLiteral(value: string): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createBigIntLiteral(value);
      },
      createTrue(): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createTrue();
      },
      createFalse(): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createFalse();
      },
      createNull(): ProxyTypes.PrimaryExpression {
        return tsInstance.factory.createNull();
      },
      createParenthesizedExpression(
        expression: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return tsInstance.factory.createParenthesizedExpression(
          expression as ts.Expression
        );
      },
      createVoidZero(): ProxyTypes.Expression {
        return tsInstance.factory.createVoidZero();
      },
    },

    isEnumAccess(
      node:
        | ProxyTypes.PropertyAccessExpression
        | ProxyTypes.ElementAccessExpression
    ): boolean {
      return isEnumAccess(
        node as ts.PropertyAccessExpression | ts.ElementAccessExpression
      );
    },
    isEnumIdentifier(node: ProxyTypes.Identifier): boolean {
      if (!typeChecker) {
        return false;
      }
      const type = typeChecker.getTypeAtLocation(node as ts.Identifier);
      return (type.getFlags() & tsInstance.TypeFlags.EnumLiteral) !== 0;
    },
    isExternalReference(
      node: ProxyTypes.Node,
      externalNames: ReadonlyArray<string | RegExp>
    ): boolean {
      if (!typeChecker) {
        return false;
      }
      const nodeSym = typeChecker.getSymbolAtLocation(node as ts.Node);
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
                return sourceFileName.fileName
                  .replace(/\\/g, '/')
                  .includes(part);
              } else {
                return part.test(sourceFileName.fileName);
              }
            })
          ) {
            return true;
          }
        }
        // Walk into the 'import' variables
        if (!tsInstance.isImportSpecifier(nodeFrom)) {
          break;
        }
        const baseName = nodeFrom.propertyName ?? nodeFrom.name;
        const baseSym = typeChecker.getSymbolAtLocation(baseName);
        // We must follow 'aliased' symbol for parsing the symbol which name is not changed from the exported symbol name
        const exportedSym =
          baseSym && baseSym.getFlags() & tsInstance.SymbolFlags.Alias
            ? typeChecker.getAliasedSymbol(baseSym)
            : baseSym;
        nodeFrom = exportedSym?.getDeclarations()?.[0];
      }
      const type = typeChecker.getTypeAtLocation(node as ts.Node);
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
    },
    hasPureAnnotation(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      const fullText = (node as ts.Node).getFullText(
        sourceFile as ts.SourceFile
      );
      const ranges = tsInstance.getLeadingCommentRanges(fullText, 0) ?? [];
      for (const range of ranges) {
        if (range.kind !== tsInstance.SyntaxKind.MultiLineCommentTrivia) {
          continue;
        }
        const text = fullText.slice(range.pos + 2, range.end - 2).trim();
        if (
          (text[0] === '@' || text[0] === '#') &&
          text.slice(1) === '__PURE__'
        ) {
          return true;
        }
      }
      return false;
    },
    isReadonlyExpression(_node: ProxyTypes.Node): boolean | null {
      if (!typeChecker) {
        return null;
      }
      const node = _node as ts.Node;
      if (
        tsInstance.isIdentifier(node) &&
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        node.parent &&
        !tsInstance.isPropertyAccessExpression(node.parent)
      ) {
        const nodeSym = typeChecker.getSymbolAtLocation(node);
        if (nodeSym?.valueDeclaration) {
          let target: ts.Node = nodeSym.valueDeclaration;
          for (;;) {
            // Parameters are writable
            if (tsInstance.isParameter(target)) {
              return false;
            }
            if (tsInstance.isVariableDeclarationList(target)) {
              if (target.flags & tsInstance.NodeFlags.Const) {
                return true;
              } else {
                return false;
              }
            }
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!target.parent || target === target.parent) {
              return false;
            }
            target = target.parent;
          }
        }
      }
      if (
        tsInstance.isPropertyAccessExpression(node) ||
        tsInstance.isElementAccessExpression(node)
      ) {
        if (isEnumAccess(node)) {
          return true;
        }
        return isReadonlyPropertyAccess(node);
      }
      return null;
    },
    isHoistablePropertyAccess(
      _node:
        | ProxyTypes.PropertyAccessExpression
        | ProxyTypes.ElementAccessExpression
    ): boolean {
      if (!typeChecker) {
        return false;
      }
      const node = _node as
        | ts.PropertyAccessExpression
        | ts.ElementAccessExpression;
      const type = typeChecker.getTypeAtLocation(node.expression);
      const memberName = tsInstance.isPropertyAccessExpression(node)
        ? node.name.getText()
        : getNameFromElementAccessExpression(node, typeChecker);
      if (memberName == null) {
        return false;
      }
      if (type.getFlags() & tsInstance.TypeFlags.Object) {
        const prop = type.getProperty(memberName);
        // If the property access uses indexed access, `prop` will be undefined
        if (prop) {
          return true;
        }
      }
      return false;
    },
    isUndefinedIdentifier(
      node: ProxyTypes.Identifier,
      parent: ProxyTypes.Node
    ): boolean {
      if (!typeChecker) {
        return false;
      }
      if (
        tsInstance.isPropertyAccessExpression(parent as ts.Node) ||
        tsInstance.isElementAccessExpression(parent as ts.Node)
      ) {
        return false;
      }
      const type = typeChecker.getTypeAtLocation(node as ts.Identifier);
      const sym = typeChecker.getSymbolAtLocation(node as ts.Identifier);
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
    },

    makeStringLiteralSource(value: string): string {
      // TypeScript namespace may export `function escapeNonAsciiString(s: string, quoteChar?: CharacterCodes.doubleQuote | CharacterCodes.singleQuote | CharacterCodes.backtick): string`
      return 'escapeNonAsciiString' in tsInstance
        ? `"${(
            tsInstance.escapeNonAsciiString as (
              s: string,
              quoteChar: number
            ) => string
          )(
            value,
            'CharacterCodes' in tsInstance
              ? (tsInstance.CharacterCodes as { doubleQuote: number })
                  .doubleQuote
              : 34 /* doubleQuote */
          )}"`
        : JSON.stringify(value);
    },
    getLineStarts(sourceFile: ProxyTypes.SourceFile): readonly number[] {
      return (sourceFile as ts.SourceFile).getLineStarts();
    },
  };
}

export function printSource(
  sourceFile: ts.SourceFile,
  tsInstance?: typeof ts
): string {
  const _ts = tsInstance ?? tsNamespace;
  return printSourceWithProxy(sourceFile, makeTscProxy(_ts, null));
}

export function printSourceWithMap(
  sourceFile: ts.SourceFile,
  originalSourceName: string,
  startOfSourceMap?: sourceMap.RawSourceMap,
  tsInstance?: typeof ts
): [string, sourceMap.RawSourceMap] {
  const _ts = tsInstance ?? tsNamespace;
  return printSourceWithMapWithProxy(
    sourceFile,
    originalSourceName,
    makeTscProxy(_ts, null),
    startOfSourceMap
  );
}

export function transformSource(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext | undefined,
  options?: TransformOptions
): ts.SourceFile {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeTscProxy(ts, program);
  return transformSourceWithProxy(
    sourceFile,
    proxy,
    context,
    options
  ) as ts.SourceFile;
}

export function transformAndPrintSource(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext | undefined,
  options?: TransformOptions
): string {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeTscProxy(ts, program);
  return transformAndPrintSourceWithProxy(sourceFile, proxy, context, options);
}

export function transformAndPrintSourceWithMap(
  sourceFile: ts.SourceFile,
  program: ts.Program,
  context: ts.TransformationContext | undefined,
  originalSourceName: string,
  options?: TransformOptions,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeTscProxy(ts, program);
  return transformAndPrintSourceWithMapWithProxy(
    sourceFile,
    proxy,
    context,
    originalSourceName,
    options,
    startOfSourceMap
  );
}
