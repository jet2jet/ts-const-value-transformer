import type * as sourceMap from 'source-map';
import type * as ts from 'typescript';
import * as tsNamespace from 'typescript';
import {
  nodeToTypeString,
  nodeToTypeFlags,
  isExpressionReadonly,
  isExternalReference,
  isUndefinedIdentifier,
  isEnumAccess,
} from './lsp/lspTransformerUtil.mjs';
import type TsLspClient from './lsp/TsLspClient.mjs';
import {
  printSourceWithMapWithProxy,
  printSourceWithProxy,
  transformAndPrintSourceWithMapWithProxy,
  transformAndPrintSourceWithProxy,
  transformSourceWithProxy,
  type TransformOptions,
} from './transform.mjs';
import type { ApiProxy, ProxyTypes } from './TsProxy.mjs';

interface DummyType {
  flags: number;
  typeString: string;
  value: unknown;
}

function makeLspProxy(
  tsInstance: typeof ts,
  lspClient: TsLspClient | null,
  getSourceFile: ((fileName: string) => ts.SourceFile) | null
): ApiProxy<ts.TransformationContext> {
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

    getTypeAtLocation(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): ProxyTypes.Type | undefined {
      if (!lspClient) {
        return undefined;
      }
      const typeString = nodeToTypeString(
        node as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
      const flags = nodeToTypeFlags(
        node as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
      let value: string | number = typeString;
      if ((flags & tsInstance.TypeFlags.NumberLiteral) !== 0) {
        value = Number(typeString);
      } else if ((flags & tsInstance.TypeFlags.StringLiteral) !== 0) {
        try {
          value = JSON.parse(typeString) as string;
        } catch {}
      }
      const t: DummyType = {
        flags,
        typeString,
        value,
      };
      return t;
    },
    isEnumLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as DummyType).flags & tsInstance.TypeFlags.EnumLiteral) !== 0
      );
    },
    isStringLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.StringLiteralType {
      return (
        ((type as DummyType).flags & tsInstance.TypeFlags.StringLiteral) !== 0
      );
    },
    isNumberLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.NumberLiteralType {
      return (
        ((type as DummyType).flags & tsInstance.TypeFlags.NumberLiteral) !== 0
      );
    },
    isBigIntLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as DummyType).flags & tsInstance.TypeFlags.BigIntLiteral) !== 0
      );
    },
    isBooleanLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as DummyType).flags & tsInstance.TypeFlags.BooleanLiteral) !== 0
      );
    },
    isNullType(type: ProxyTypes.Type): boolean {
      return ((type as DummyType).flags & tsInstance.TypeFlags.Null) !== 0;
    },
    isUndefinedType(type: ProxyTypes.Type): boolean {
      return ((type as DummyType).flags & tsInstance.TypeFlags.Undefined) !== 0;
    },
    typeToString(type: ProxyTypes.Type): string {
      return (type as DummyType).typeString;
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
        return tsInstance.factory.createParenthesizedExpression(
          tsInstance.factory.createPrefixUnaryExpression(
            tsInstance.SyntaxKind.MinusToken,
            operand as ts.Expression
          )
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
        return tsInstance.factory.createParenthesizedExpression(
          tsInstance.factory.createVoidZero()
        );
      },
    },

    isEnumAccess(
      node:
        | ProxyTypes.PropertyAccessExpression
        | ProxyTypes.ElementAccessExpression,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      if (!lspClient) {
        return false;
      }
      return isEnumAccess(
        node as ts.PropertyAccessExpression | ts.ElementAccessExpression,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
    },
    isEnumIdentifier(
      node: ProxyTypes.Identifier,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      if (!lspClient) {
        return false;
      }
      const typeFlags = nodeToTypeFlags(
        node as ProxyTypes.Node as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
      return (typeFlags & tsInstance.TypeFlags.EnumLiteral) !== 0;
    },
    isExternalReference(
      node: ProxyTypes.Node,
      externalNames: ReadonlyArray<string | RegExp>,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      if (!lspClient) {
        return false;
      }
      return isExternalReference(
        node as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient,
        externalNames
      );
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
    isReadonlyExpression(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): boolean | null {
      if (!lspClient) {
        return null;
      }
      return isExpressionReadonly(
        node as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient,
        getSourceFile
      );
    },
    isHoistablePropertyAccess(
      _node:
        | ProxyTypes.PropertyAccessExpression
        | ProxyTypes.ElementAccessExpression,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      if (!lspClient) {
        return false;
      }
      const node = _node as
        | ts.PropertyAccessExpression
        | ts.ElementAccessExpression;
      const typeFlags = nodeToTypeFlags(
        node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
      return typeFlags !== 0;
    },
    isUndefinedIdentifier(
      node: ProxyTypes.Identifier,
      parent: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      if (!lspClient) {
        return false;
      }
      return isUndefinedIdentifier(
        node as ts.Identifier,
        parent as ts.Node,
        sourceFile as ts.SourceFile,
        tsInstance,
        lspClient
      );
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
  return printSourceWithProxy(sourceFile, makeLspProxy(_ts, null, null));
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
    makeLspProxy(_ts, null, null),
    startOfSourceMap
  );
}

export function transformSource(
  sourceFile: ts.SourceFile,
  lspClient: TsLspClient,
  getSourceFile: (fileName: string) => ts.SourceFile,
  options?: TransformOptions
): ts.SourceFile {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeLspProxy(ts, lspClient, getSourceFile);
  return transformSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  ) as ts.SourceFile;
}

export function transformAndPrintSource(
  sourceFile: ts.SourceFile,
  lspClient: TsLspClient,
  getSourceFile: (fileName: string) => ts.SourceFile,
  options?: TransformOptions
): string {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeLspProxy(ts, lspClient, getSourceFile);
  return transformAndPrintSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  );
}

export function transformAndPrintSourceWithMap(
  sourceFile: ts.SourceFile,
  lspClient: TsLspClient,
  getSourceFile: (fileName: string) => ts.SourceFile,
  originalSourceName: string,
  options?: TransformOptions,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const ts = options?.ts ?? tsNamespace;
  const proxy = makeLspProxy(ts, lspClient, getSourceFile);
  return transformAndPrintSourceWithMapWithProxy(
    sourceFile,
    proxy,
    undefined,
    originalSourceName,
    options,
    startOfSourceMap
  );
}
