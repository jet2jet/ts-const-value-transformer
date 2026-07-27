import type * as tsgoAst from '@typescript/native/unstable/ast';
import type * as tsgoAstFactory from '@typescript/native/unstable/ast/factory';
import type * as tsgoAstUtils from '@typescript/native/unstable/ast/utils';
import type * as tsgoApi from '@typescript/native/unstable/sync';
import type * as sourceMap from 'source-map';
import {
  printSourceWithMapWithProxy,
  printSourceWithProxy,
  transformAndPrintSourceWithMapWithProxy,
  transformAndPrintSourceWithProxy,
  transformSourceWithProxy,
  type TransformOptions,
} from './transform.mjs';
import type { ApiProxy, ProxyTypes } from './TsProxy.mjs';

const SYMBOL_TYPE_PROPERTIES = Symbol('type-properties');

interface TypeWithSymbols extends tsgoApi.Type {
  [SYMBOL_TYPE_PROPERTIES]?: readonly tsgoApi.Symbol[];
}

function getNodeText(
  node: tsgoAst.Node,
  sourceFile: tsgoAst.SourceFile,
  tsgoAstInstance: typeof tsgoAst
): string {
  // same implementation of legacy typescript's getText()
  const start = tsgoAstInstance.getTokenPosOfNode(node, sourceFile);
  return sourceFile.text.slice(start, node.end);
}

function getNodeFullText(
  node: tsgoAst.Node,
  sourceFile: tsgoAst.SourceFile
): string {
  return sourceFile.text.slice(node.pos, node.end);
}

function getPropertiesOfType(type: tsgoApi.Type, typeChecker: tsgoApi.Checker) {
  // Use cache because getPropertiesOfType uses api calls
  let properties = (type as TypeWithSymbols)[SYMBOL_TYPE_PROPERTIES];
  if (!properties) {
    properties = typeChecker.getPropertiesOfType(type);
    (type as TypeWithSymbols)[SYMBOL_TYPE_PROPERTIES] = properties;
  }
  return properties;
}

function getAliasedSymbol(
  typeChecker: tsgoApi.Checker,
  project: tsgoApi.Project,
  symbol: tsgoApi.Symbol,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstUtilsInstance: typeof tsgoAstUtils
): tsgoApi.Symbol {
  for (const n of symbol.declarations) {
    const node = n.resolve(project);
    if (!node) {
      continue;
    }
    if (tsgoAstInstance.isImportClause(node)) {
      const d = node.name;
      const p = node.parent;
      if (
        d != null &&
        node.namedBindings == null &&
        p != null &&
        tsgoAstInstance.isImportDeclaration(p)
      ) {
        const exportSym = pickExportSymbolFromSpecifier(
          p.moduleSpecifier,
          'default'
        );
        const r = exportSym && getActualSymbolFromExport(exportSym);
        return r
          ? getAliasedSymbol(
              typeChecker,
              project,
              r,
              tsgoApiInstance,
              tsgoAstInstance,
              tsgoAstUtilsInstance
            )
          : symbol;
      }
    } else if (tsgoAstInstance.isImportSpecifier(node)) {
      if (node.propertyName) {
        const symName = typeChecker.getSymbolAtLocation(node.propertyName);
        const r = symName && getActualSymbolFromExport(symName);
        return r
          ? getAliasedSymbol(
              typeChecker,
              project,
              r,
              tsgoApiInstance,
              tsgoAstInstance,
              tsgoAstUtilsInstance
            )
          : symbol;
      } else {
        const p = node.parent?.parent?.parent;
        if (p != null && tsgoAstInstance.isImportDeclaration(p)) {
          const exportName = getNodeText(
            node.name,
            node.getSourceFile(),
            tsgoAstInstance
          );
          const exportSym = pickExportSymbolFromSpecifier(
            p.moduleSpecifier,
            exportName
          );
          const r = exportSym && getActualSymbolFromExport(exportSym);
          return r
            ? getAliasedSymbol(
                typeChecker,
                project,
                r,
                tsgoApiInstance,
                tsgoAstInstance,
                tsgoAstUtilsInstance
              )
            : symbol;
        }
      }
    }
  }
  return symbol;

  function pickExportSymbolFromSpecifier(
    moduleSpecifier: tsgoAst.Node,
    exportName: string
  ) {
    const sym = typeChecker.getSymbolAtLocation(moduleSpecifier);
    if (!sym) {
      return null;
    }
    const exports = sym.getExports();
    const e = exports.get(
      tsgoAstUtilsInstance.escapeLeadingUnderscores('export=')
    );
    if (e) {
      const t = typeChecker.getTypeOfSymbol(e);
      if (t) {
        return getPropertiesOfType(t, typeChecker).find(
          (sym) => sym.name === exportName
        );
      } else {
        return null;
      }
    } else {
      return (
        exports.get(
          tsgoAstUtilsInstance.escapeLeadingUnderscores(exportName)
        ) ?? null
      );
    }
  }

  function getActualSymbolFromExport(symbol: tsgoApi.Symbol): tsgoApi.Symbol {
    for (const n of symbol.declarations) {
      const node = n.resolve(project);
      if (!node) {
        continue;
      }
      if (tsgoAstInstance.isExportSpecifier(node)) {
        // Handle 'export { A } from "module"' pattern
        const p = node.parent?.parent;
        if (
          p != null &&
          tsgoAstInstance.isExportDeclaration(p) &&
          p.moduleSpecifier
        ) {
          if (node.propertyName) {
            const symName = typeChecker.getSymbolAtLocation(node.propertyName);
            const r = symName && getActualSymbolFromExport(symName);
            return r ?? symName ?? symbol;
          } else {
            const exportName = getNodeText(
              node.name,
              node.getSourceFile(),
              tsgoAstInstance
            );
            const exportSym = pickExportSymbolFromSpecifier(
              p.moduleSpecifier,
              exportName
            );
            const r = exportSym && getActualSymbolFromExport(exportSym);
            return r ?? symbol;
          }
        }

        const nameNode = node.propertyName ?? node.name;
        // ExportSpecifier should be either:
        //   * export { A } : only node.name is available
        //   * export { A as B } -- or -- export { A as 'literal' } : node.propertyName is available
        //   -- node.propertyName would not be identifier
        if (tsgoAstInstance.isIdentifier(nameNode)) {
          const s = typeChecker.getResolvedSymbol(nameNode);
          return s ?? symbol;
        }
      } else if (tsgoAstInstance.isExportAssignment(node)) {
        const exprSym = typeChecker.getSymbolAtLocation(node.expression);
        return exprSym ?? symbol;
      }
    }
    return symbol;
  }
}

function isSourceFileFromExternalLibrary(sourceFile: tsgoAst.SourceFile) {
  // Legacy typescript only uses `isExternalLibraryImport` derived from whether the path includes 'node_modules'
  return /[\\/]node_modules[\\/]/.test(sourceFile.fileName);
}

function getNameFromElementAccessExpression(
  node: tsgoAst.ElementAccessExpression,
  typeChecker: tsgoApi.Checker,
  tsgoApiInstance: typeof tsgoApi
) {
  const type = typeChecker.getTypeAtLocation(node.argumentExpression);
  if (type == null) {
    return false;
  }
  if (
    ((type.flags & tsgoApiInstance.TypeFlags.StringLiteral) !== 0 ||
      (type.flags & tsgoApiInstance.TypeFlags.NumberLiteral) !== 0) &&
    'value' in type
  ) {
    return `${type.value as string | number}`;
  }
  return null;
}

function isEnumLiteralType(
  type: tsgoApi.Type,
  tsgoApiInstance: typeof tsgoApi
) {
  return (type.flags & tsgoApiInstance.TypeFlags.EnumLiteral) !== 0;
}

function makeTsgoProxy(
  project: tsgoApi.Project | null,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils
): ApiProxy {
  const typeChecker = project && project.checker;

  const getTypeAtLocation = (node: tsgoAst.Node) => {
    if (!typeChecker) {
      return undefined;
    }
    return typeChecker.getTypeAtLocation(node);
  };

  const isEnumAccess = (
    node: tsgoAst.PropertyAccessExpression | tsgoAst.ElementAccessExpression
  ) => {
    if (!typeChecker) {
      return false;
    }
    const type = getTypeAtLocation(node);
    if (type == null) {
      return false;
    }
    return isEnumLiteralType(type, tsgoApiInstance);
  };
  const isReadonlyPropertyAccess = (
    node: tsgoAst.PropertyAccessExpression | tsgoAst.ElementAccessExpression
  ): boolean => {
    if (!typeChecker) {
      return false;
    }
    const type = getTypeAtLocation(node.expression);
    if (type == null) {
      return false;
    }
    const memberName = tsgoAstInstance.isPropertyAccessExpression(node)
      ? node.name.text
      : getNameFromElementAccessExpression(node, typeChecker, tsgoApiInstance);
    if (memberName == null) {
      return false;
    }
    if (type.flags & tsgoApiInstance.TypeFlags.Object) {
      const properties = getPropertiesOfType(type, typeChecker);
      const prop = properties.find((sym) => sym.name === memberName);
      if (prop) {
        // Use undeclared enum value to improve memory performance
        if ((prop.checkFlags & 8) /* Readonly */ !== 0) {
          return true;
        }
        // similar to getDeclarationModifierFlagsFromSymbol
        if (prop.valueDeclaration) {
          const effectiveDeclaration =
            (prop.flags & tsgoApiInstance.SymbolFlags.GetAccessor &&
              prop.declarations.find(
                (decl) => decl.kind === tsgoAstInstance.SyntaxKind.GetAccessor
              )) ||
            prop.valueDeclaration;
          const n = effectiveDeclaration.resolve(project);
          if (
            n != null &&
            'modifierFlags' in n &&
            ((n.modifierFlags as number) &
              tsgoAstInstance.ModifierFlags.Readonly) !==
              0
          ) {
            return true;
          }
        }

        if (prop.declarations.length > 0) {
          const decl = prop.declarations[0]!.resolve(project);
          if (
            decl &&
            tsgoAstInstance.isPropertySignatureDeclaration(decl) &&
            decl.modifiers?.some(
              (m) => m.kind === tsgoAstInstance.SyntaxKind.ReadonlyKeyword
            )
          ) {
            return true;
          }
          if (
            decl &&
            tsgoAstInstance.isVariableDeclaration(decl) &&
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            decl.parent &&
            tsgoAstInstance.isVariableDeclarationList(decl.parent) &&
            decl.parent.flags & tsgoAstInstance.NodeFlags.Const
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
      ) => ProxyTypes.Node | readonly ProxyTypes.Node[] | undefined
    ): T {
      return tsgoAstInstance.visitEachChild(
        node as ProxyTypes.Node as tsgoAst.Node,
        visitor as tsgoAst.Visitor
      ) as ProxyTypes.Node as T;
    },
    getNodeText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return getNodeText(
        node as tsgoAst.Node,
        sourceFile as tsgoAst.SourceFile,
        tsgoAstInstance
      );
    },
    getNodeFullText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return getNodeFullText(
        node as tsgoAst.Node,
        sourceFile as tsgoAst.SourceFile
      );
    },
    appendMultiLineComment<Node extends ProxyTypes.Node>(
      node: Node,
      _comment: string
    ): Node {
      // Do nothing because node does not support having comments
      // (This should not be used for modified node)
      return node;
    },
    setTextRange<T extends ProxyTypes.TextRange>(
      range: T,
      location: ProxyTypes.TextRange | undefined
    ): T {
      if (!location) {
        return range;
      }
      (range as { pos: number }).pos = location.pos;
      (range as { end: number }).end = location.end;
      return range;
    },
    isExpression(node: ProxyTypes.Node): node is ProxyTypes.Expression {
      return tsgoAstInstance.isExpression(node as tsgoAst.Node);
    },
    isAsExpression(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isAsExpression(node as tsgoAst.Node);
    },
    isCallLikeExpression(node: ProxyTypes.Node): boolean {
      const n = node as tsgoAst.Node;
      // Since TypeScript 7, isCallLikeExpression includes BinaryExpression, which is treated as CallLike only when 'instanceof' syntax
      if (tsgoAstInstance.isBinaryExpression(n)) {
        return (
          n.operatorToken.kind === tsgoAstInstance.SyntaxKind.InstanceOfKeyword
        );
      }
      if (!tsgoAstInstance.isCallLikeExpression(n)) {
        return false;
      }
      return true;
    },
    isTemplateExpression(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isTemplateExpression(node as tsgoAst.Node);
    },
    isPropertyAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.PropertyAccessExpression {
      return tsgoAstInstance.isPropertyAccessExpression(node as tsgoAst.Node);
    },
    isElementAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.ElementAccessExpression {
      return tsgoAstInstance.isElementAccessExpression(node as tsgoAst.Node);
    },
    isInterfaceDeclaration(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isInterfaceDeclaration(node as tsgoAst.Node);
    },
    isTypeAliasDeclaration(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isTypeAliasDeclaration(node as tsgoAst.Node);
    },
    isImportDeclaration(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isImportDeclaration(node as tsgoAst.Node);
    },
    isTypeOnlyExportDeclaration(node: ProxyTypes.Node): boolean {
      // almost same implementation of legacy typescript's isTypeOnlyExportDeclaration()
      const n = node as tsgoAst.Node;
      if (tsgoAstInstance.isExportSpecifier(n)) {
        if (n.isTypeOnly) {
          return true;
        }
        const p1 = n.parent;
        if (p1 == null || !tsgoAstInstance.isNamedExports(p1)) {
          return false;
        }
        const p2 = p1.parent;
        if (p2 == null || !tsgoAstInstance.isExportDeclaration(p2)) {
          return false;
        }
        return p2.isTypeOnly;
      } else if (tsgoAstInstance.isExportDeclaration(n)) {
        return n.isTypeOnly && !!n.moduleSpecifier && !n.exportClause;
      } else if (tsgoAstInstance.isNamespaceExport(n)) {
        const p = n.parent;
        if (p == null || !tsgoAstInstance.isExportDeclaration(p)) {
          return false;
        }
        return p.isTypeOnly;
      }
      return false;
    },
    isIdentifier(node: ProxyTypes.Node): node is ProxyTypes.Identifier {
      return tsgoAstInstance.isIdentifier(node as tsgoAst.Node);
    },
    isComputedPropertyName(node: ProxyTypes.Node): boolean {
      return tsgoAstInstance.isComputedPropertyName(node as tsgoAst.Node);
    },

    getTypeAtLocation(node: ProxyTypes.Node): ProxyTypes.Type | undefined {
      return getTypeAtLocation(node as tsgoAst.Node);
    },
    isEnumLiteral(type: ProxyTypes.Type): boolean {
      return isEnumLiteralType(type as tsgoApi.Type, tsgoApiInstance);
    },
    isStringLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.StringLiteralType {
      return (
        ((type as tsgoApi.Type).flags &
          tsgoApiInstance.TypeFlags.StringLiteral) !==
        0
      );
    },
    isNumberLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.NumberLiteralType {
      return (
        ((type as tsgoApi.Type).flags &
          tsgoApiInstance.TypeFlags.NumberLiteral) !==
        0
      );
    },
    isBigIntLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as tsgoApi.Type).flags &
          tsgoApiInstance.TypeFlags.BigIntLiteral) !==
        0
      );
    },
    isBooleanLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as tsgoApi.Type).flags &
          tsgoApiInstance.TypeFlags.BooleanLiteral) !==
        0
      );
    },
    isNullType(type: ProxyTypes.Type): boolean {
      return (
        ((type as tsgoApi.Type).flags & tsgoApiInstance.TypeFlags.Null) !== 0
      );
    },
    isUndefinedType(type: ProxyTypes.Type): boolean {
      return (
        ((type as tsgoApi.Type).flags & tsgoApiInstance.TypeFlags.Undefined) !==
        0
      );
    },
    typeToString(type: ProxyTypes.Type): string {
      return typeChecker?.typeToString(type as tsgoApi.Type) ?? '';
    },

    factory: {
      createIdentifier(text: string): ProxyTypes.Identifier {
        return tsgoAstFactoryInstance.createIdentifier(text);
      },
      createStringLiteral(value: string): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createStringLiteral(value, 0);
      },
      createNumericLiteral(
        value: number | string
      ): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createNumericLiteral(`${value}`, 0);
      },
      createExpressionWithMinusToken(
        operand: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return tsgoAstFactoryInstance.createParenthesizedExpression(
          tsgoAstFactoryInstance.createPrefixUnaryExpression(
            tsgoAstInstance.SyntaxKind.MinusToken,
            operand as tsgoAst.Expression
          )
        );
      },
      createBigIntLiteral(value: string): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createBigIntLiteral(value, 0);
      },
      createTrue(): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createKeywordExpression(
          tsgoAstInstance.SyntaxKind.TrueKeyword
        );
      },
      createFalse(): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createKeywordExpression(
          tsgoAstInstance.SyntaxKind.FalseKeyword
        );
      },
      createNull(): ProxyTypes.PrimaryExpression {
        return tsgoAstFactoryInstance.createKeywordExpression(
          tsgoAstInstance.SyntaxKind.NullKeyword
        );
      },
      createParenthesizedExpression(
        expression: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return tsgoAstFactoryInstance.createParenthesizedExpression(
          expression as tsgoAst.Expression
        );
      },
      createVoidZero(): ProxyTypes.Expression {
        return tsgoAstFactoryInstance.createParenthesizedExpression(
          tsgoAstFactoryInstance.createVoidExpression(
            tsgoAstFactoryInstance.createNumericLiteral('0', 0)
          )
        );
      },
    },

    isEnumAccess(
      node:
        | ProxyTypes.PropertyAccessExpression
        | ProxyTypes.ElementAccessExpression
    ): boolean {
      return isEnumAccess(
        node as
          | tsgoAst.PropertyAccessExpression
          | tsgoAst.ElementAccessExpression
      );
    },
    isEnumIdentifier(node: ProxyTypes.Identifier): boolean {
      if (!typeChecker) {
        return false;
      }
      const type = getTypeAtLocation(node as tsgoAst.Identifier);
      return type != null && isEnumLiteralType(type, tsgoApiInstance);
    },
    isExternalReference(
      node: ProxyTypes.Node,
      externalNames: ReadonlyArray<string | RegExp>
    ): boolean {
      if (!typeChecker) {
        return false;
      }
      const nodeSym = typeChecker.getSymbolAtLocation(node as tsgoAst.Node);
      let nodeFrom = nodeSym?.declarations?.[0];
      while (nodeFrom) {
        const n = nodeFrom.resolve(project);
        if (!n) {
          break;
        }
        const sourceFile = n.getSourceFile();
        if (externalNames.length === 0) {
          if (/[\\/]node_modules[\\/]/.test(sourceFile.fileName)) {
            return true;
          }
        } else {
          if (
            externalNames.some((part) => {
              if (typeof part === 'string') {
                return sourceFile.fileName.replace(/\\/g, '/').includes(part);
              } else {
                return part.test(sourceFile.fileName);
              }
            })
          ) {
            return true;
          }
        }
        // Walk into the 'import' variables
        if (!tsgoAstInstance.isImportSpecifier(n)) {
          break;
        }
        const baseName = n.propertyName ?? n.name;
        const baseSym = typeChecker.getSymbolAtLocation(baseName);
        // We must follow 'aliased' symbol for parsing the symbol which name is not changed from the exported symbol name
        const exportedSym =
          baseSym && baseSym.flags & tsgoApiInstance.SymbolFlags.Alias
            ? (getAliasedSymbol(
                typeChecker,
                project,
                baseSym,
                tsgoApiInstance,
                tsgoAstInstance,
                tsgoAstUtilsInstance
              ) ?? baseSym)
            : baseSym;
        const nextNodeFrom = exportedSym?.declarations?.[0];
        if (nextNodeFrom === nodeFrom) {
          break;
        }
        nodeFrom = nextNodeFrom;
      }
      const type = getTypeAtLocation(node as tsgoAst.Node);
      const sym = type?.getSymbol();
      if (!sym) {
        return false;
      }
      const def = sym.declarations?.[0]?.resolve(project);
      if (!def) {
        return false;
      }
      const typeDefinitionSource = def.getSourceFile();
      if (isSourceFileFromExternalLibrary(typeDefinitionSource)) {
        return true;
      }
      return false;
    },
    hasPureAnnotation(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): boolean {
      const fullText = getNodeFullText(
        node as tsgoAst.Node,
        sourceFile as tsgoAst.SourceFile
      );
      const ranges = tsgoAstInstance.getLeadingCommentRanges(fullText, 0) ?? [];
      for (const range of ranges) {
        if (range.kind !== tsgoAstInstance.SyntaxKind.MultiLineCommentTrivia) {
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
        return false;
      }
      const node = _node as tsgoAst.Node;
      if (
        tsgoAstInstance.isIdentifier(node) &&
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        node.parent &&
        !tsgoAstInstance.isPropertyAccessExpression(node.parent)
      ) {
        const nodeSym = typeChecker.getSymbolAtLocation(node);
        if (nodeSym?.valueDeclaration) {
          let target: tsgoAst.Node | undefined =
            nodeSym.valueDeclaration.resolve(project);
          for (;;) {
            if (!target) {
              return false;
            }
            // Parameters are writable
            if (target.kind === tsgoAstInstance.SyntaxKind.Parameter) {
              return false;
            }
            if (tsgoAstInstance.isVariableDeclarationList(target)) {
              if (target.flags & tsgoAstInstance.NodeFlags.Const) {
                return true;
              } else {
                return false;
              }
            }
            if (target === target.parent) {
              return false;
            }
            target = target.parent;
          }
        }
      }
      if (
        tsgoAstInstance.isPropertyAccessExpression(node) ||
        tsgoAstInstance.isElementAccessExpression(node)
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
        | tsgoAst.PropertyAccessExpression
        | tsgoAst.ElementAccessExpression;
      const type = getTypeAtLocation(node.expression);
      const memberName = tsgoAstInstance.isPropertyAccessExpression(node)
        ? node.name.text
        : getNameFromElementAccessExpression(
            node,
            typeChecker,
            tsgoApiInstance
          );
      if (memberName == null) {
        return false;
      }
      if (type != null && type.flags & tsgoApiInstance.TypeFlags.Object) {
        const properties = getPropertiesOfType(type, typeChecker);
        const prop = properties.find((sym) => sym.name === memberName);
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
        tsgoAstInstance.isPropertyAccessExpression(parent as tsgoAst.Node) ||
        tsgoAstInstance.isElementAccessExpression(parent as tsgoAst.Node)
      ) {
        return false;
      }
      const type = getTypeAtLocation(node as tsgoAst.Identifier);
      const sym = typeChecker.getSymbolAtLocation(node as tsgoAst.Identifier);
      if (!sym || sym.name !== 'undefined') {
        return false;
      }
      if (
        type == null ||
        type.flags & tsgoApiInstance.TypeFlags.UnionOrIntersection ||
        !(type.flags & tsgoApiInstance.TypeFlags.Undefined)
      ) {
        return false;
      }
      return true;
    },

    makeStringLiteralSource(value: string): string {
      // tsgo does not have escapeNonAsciiString
      return JSON.stringify(value);
    },
    getLineStarts(sourceFile: ProxyTypes.SourceFile): readonly number[] {
      return tsgoAstInstance.computeLineStarts(sourceFile.text);
    },
  };
}

export function printSource(
  project: tsgoApi.Project | null,
  sourceFile: tsgoAst.SourceFile,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils
): string {
  return printSourceWithProxy(
    sourceFile,
    makeTsgoProxy(
      project,
      tsgoApiInstance,
      tsgoAstInstance,
      tsgoAstFactoryInstance,
      tsgoAstUtilsInstance
    )
  );
}

export function printSourceWithMap(
  project: tsgoApi.Project | null,
  sourceFile: tsgoAst.SourceFile,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils,
  originalSourceName: string,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  return printSourceWithMapWithProxy(
    sourceFile,
    originalSourceName,
    makeTsgoProxy(
      project,
      tsgoApiInstance,
      tsgoAstInstance,
      tsgoAstFactoryInstance,
      tsgoAstUtilsInstance
    ),
    startOfSourceMap
  );
}

export function transformSource(
  project: tsgoApi.Project | null,
  sourceFile: tsgoAst.SourceFile,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils,
  options?: TransformOptions
): tsgoAst.SourceFile {
  const proxy = makeTsgoProxy(
    project,
    tsgoApiInstance,
    tsgoAstInstance,
    tsgoAstFactoryInstance,
    tsgoAstUtilsInstance
  );
  return transformSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  ) as tsgoAst.SourceFile;
}

export function transformAndPrintSource(
  project: tsgoApi.Project | null,
  sourceFile: tsgoAst.SourceFile,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils,
  options?: TransformOptions
): string {
  const proxy = makeTsgoProxy(
    project,
    tsgoApiInstance,
    tsgoAstInstance,
    tsgoAstFactoryInstance,
    tsgoAstUtilsInstance
  );
  return transformAndPrintSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  );
}

export function transformAndPrintSourceWithMap(
  project: tsgoApi.Project | null,
  sourceFile: tsgoAst.SourceFile,
  tsgoApiInstance: typeof tsgoApi,
  tsgoAstInstance: typeof tsgoAst,
  tsgoAstFactoryInstance: typeof tsgoAstFactory,
  tsgoAstUtilsInstance: typeof tsgoAstUtils,
  originalSourceName: string,
  options?: TransformOptions,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const proxy = makeTsgoProxy(
    project,
    tsgoApiInstance,
    tsgoAstInstance,
    tsgoAstFactoryInstance,
    tsgoAstUtilsInstance
  );
  return transformAndPrintSourceWithMapWithProxy(
    sourceFile,
    proxy,
    undefined,
    originalSourceName,
    options,
    startOfSourceMap
  );
}
