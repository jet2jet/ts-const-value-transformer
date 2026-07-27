import type * as ts7Ast from '@typescript/native/unstable/ast';
import type * as ts7AstFactory from '@typescript/native/unstable/ast/factory';
import type * as ts7AstUtils from '@typescript/native/unstable/ast/utils';
import type * as ts7Api from '@typescript/native/unstable/sync';
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

interface TypeWithSymbols extends ts7Api.Type {
  [SYMBOL_TYPE_PROPERTIES]?: readonly ts7Api.Symbol[];
}

function getNodeText(
  node: ts7Ast.Node,
  sourceFile: ts7Ast.SourceFile,
  ts7AstInstance: typeof ts7Ast
): string {
  // same implementation of legacy typescript's getText()
  const start = ts7AstInstance.getTokenPosOfNode(node, sourceFile);
  return sourceFile.text.slice(start, node.end);
}

function getNodeFullText(
  node: ts7Ast.Node,
  sourceFile: ts7Ast.SourceFile
): string {
  return sourceFile.text.slice(node.pos, node.end);
}

function getPropertiesOfType(type: ts7Api.Type, typeChecker: ts7Api.Checker) {
  // Use cache because getPropertiesOfType uses api calls
  let properties = (type as TypeWithSymbols)[SYMBOL_TYPE_PROPERTIES];
  if (!properties) {
    properties = typeChecker.getPropertiesOfType(type);
    (type as TypeWithSymbols)[SYMBOL_TYPE_PROPERTIES] = properties;
  }
  return properties;
}

function getAliasedSymbol(
  typeChecker: ts7Api.Checker,
  project: ts7Api.Project,
  symbol: ts7Api.Symbol,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstUtilsInstance: typeof ts7AstUtils
): ts7Api.Symbol {
  for (const n of symbol.declarations) {
    const node = n.resolve(project);
    if (!node) {
      continue;
    }
    if (ts7AstInstance.isImportClause(node)) {
      const d = node.name;
      const p = node.parent;
      if (
        d != null &&
        node.namedBindings == null &&
        p != null &&
        ts7AstInstance.isImportDeclaration(p)
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
              ts7ApiInstance,
              ts7AstInstance,
              ts7AstUtilsInstance
            )
          : symbol;
      }
    } else if (ts7AstInstance.isImportSpecifier(node)) {
      if (node.propertyName) {
        const symName = typeChecker.getSymbolAtLocation(node.propertyName);
        const r = symName && getActualSymbolFromExport(symName);
        return r
          ? getAliasedSymbol(
              typeChecker,
              project,
              r,
              ts7ApiInstance,
              ts7AstInstance,
              ts7AstUtilsInstance
            )
          : symbol;
      } else {
        const p = node.parent?.parent?.parent;
        if (p != null && ts7AstInstance.isImportDeclaration(p)) {
          const exportName = getNodeText(
            node.name,
            node.getSourceFile(),
            ts7AstInstance
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
                ts7ApiInstance,
                ts7AstInstance,
                ts7AstUtilsInstance
              )
            : symbol;
        }
      }
    }
  }
  return symbol;

  function pickExportSymbolFromSpecifier(
    moduleSpecifier: ts7Ast.Node,
    exportName: string
  ) {
    const sym = typeChecker.getSymbolAtLocation(moduleSpecifier);
    if (!sym) {
      return null;
    }
    const exports = sym.getExports();
    const e = exports.get(
      ts7AstUtilsInstance.escapeLeadingUnderscores('export=')
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
        exports.get(ts7AstUtilsInstance.escapeLeadingUnderscores(exportName)) ??
        null
      );
    }
  }

  function getActualSymbolFromExport(symbol: ts7Api.Symbol): ts7Api.Symbol {
    for (const n of symbol.declarations) {
      const node = n.resolve(project);
      if (!node) {
        continue;
      }
      if (ts7AstInstance.isExportSpecifier(node)) {
        // Handle 'export { A } from "module"' pattern
        const p = node.parent?.parent;
        if (
          p != null &&
          ts7AstInstance.isExportDeclaration(p) &&
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
              ts7AstInstance
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
        if (ts7AstInstance.isIdentifier(nameNode)) {
          const s = typeChecker.getResolvedSymbol(nameNode);
          return s ?? symbol;
        }
      } else if (ts7AstInstance.isExportAssignment(node)) {
        const exprSym = typeChecker.getSymbolAtLocation(node.expression);
        return exprSym ?? symbol;
      }
    }
    return symbol;
  }
}

function isSourceFileFromExternalLibrary(sourceFile: ts7Ast.SourceFile) {
  // Legacy typescript only uses `isExternalLibraryImport` derived from whether the path includes 'node_modules'
  return /[\\/]node_modules[\\/]/.test(sourceFile.fileName);
}

function getNameFromElementAccessExpression(
  node: ts7Ast.ElementAccessExpression,
  typeChecker: ts7Api.Checker,
  ts7ApiInstance: typeof ts7Api
) {
  const type = typeChecker.getTypeAtLocation(node.argumentExpression);
  if (type == null) {
    return false;
  }
  if (
    ((type.flags & ts7ApiInstance.TypeFlags.StringLiteral) !== 0 ||
      (type.flags & ts7ApiInstance.TypeFlags.NumberLiteral) !== 0) &&
    'value' in type
  ) {
    return `${type.value as string | number}`;
  }
  return null;
}

function isEnumLiteralType(type: ts7Api.Type, ts7ApiInstance: typeof ts7Api) {
  return (type.flags & ts7ApiInstance.TypeFlags.EnumLiteral) !== 0;
}

function makeTsgoProxy(
  project: ts7Api.Project | null,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils
): ApiProxy {
  const typeChecker = project && project.checker;

  const getTypeAtLocation = (node: ts7Ast.Node) => {
    if (!typeChecker) {
      return undefined;
    }
    return typeChecker.getTypeAtLocation(node);
  };

  const isEnumAccess = (
    node: ts7Ast.PropertyAccessExpression | ts7Ast.ElementAccessExpression
  ) => {
    if (!typeChecker) {
      return false;
    }
    const type = getTypeAtLocation(node);
    if (type == null) {
      return false;
    }
    return isEnumLiteralType(type, ts7ApiInstance);
  };
  const isReadonlyPropertyAccess = (
    node: ts7Ast.PropertyAccessExpression | ts7Ast.ElementAccessExpression
  ): boolean => {
    if (!typeChecker) {
      return false;
    }
    const type = getTypeAtLocation(node.expression);
    if (type == null) {
      return false;
    }
    const memberName = ts7AstInstance.isPropertyAccessExpression(node)
      ? node.name.text
      : getNameFromElementAccessExpression(node, typeChecker, ts7ApiInstance);
    if (memberName == null) {
      return false;
    }
    if (type.flags & ts7ApiInstance.TypeFlags.Object) {
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
            (prop.flags & ts7ApiInstance.SymbolFlags.GetAccessor &&
              prop.declarations.find(
                (decl) => decl.kind === ts7AstInstance.SyntaxKind.GetAccessor
              )) ||
            prop.valueDeclaration;
          const n = effectiveDeclaration.resolve(project);
          if (
            n != null &&
            'modifierFlags' in n &&
            ((n.modifierFlags as number) &
              ts7AstInstance.ModifierFlags.Readonly) !==
              0
          ) {
            return true;
          }
        }

        if (prop.declarations.length > 0) {
          const decl = prop.declarations[0]!.resolve(project);
          if (
            decl &&
            ts7AstInstance.isPropertySignatureDeclaration(decl) &&
            decl.modifiers?.some(
              (m) => m.kind === ts7AstInstance.SyntaxKind.ReadonlyKeyword
            )
          ) {
            return true;
          }
          if (
            decl &&
            ts7AstInstance.isVariableDeclaration(decl) &&
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            decl.parent &&
            ts7AstInstance.isVariableDeclarationList(decl.parent) &&
            decl.parent.flags & ts7AstInstance.NodeFlags.Const
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
      return ts7AstInstance.visitEachChild(
        node as ProxyTypes.Node as ts7Ast.Node,
        visitor as ts7Ast.Visitor
      ) as ProxyTypes.Node as T;
    },
    getNodeText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return getNodeText(
        node as ts7Ast.Node,
        sourceFile as ts7Ast.SourceFile,
        ts7AstInstance
      );
    },
    getNodeFullText(
      node: ProxyTypes.Node,
      sourceFile: ProxyTypes.SourceFile
    ): string {
      return getNodeFullText(
        node as ts7Ast.Node,
        sourceFile as ts7Ast.SourceFile
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
      return ts7AstInstance.isExpression(node as ts7Ast.Node);
    },
    isAsExpression(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isAsExpression(node as ts7Ast.Node);
    },
    isCallLikeExpression(node: ProxyTypes.Node): boolean {
      const n = node as ts7Ast.Node;
      // Since TypeScript 7, isCallLikeExpression includes BinaryExpression, which is treated as CallLike only when 'instanceof' syntax
      if (ts7AstInstance.isBinaryExpression(n)) {
        return (
          n.operatorToken.kind === ts7AstInstance.SyntaxKind.InstanceOfKeyword
        );
      }
      if (!ts7AstInstance.isCallLikeExpression(n)) {
        return false;
      }
      return true;
    },
    isTemplateExpression(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isTemplateExpression(node as ts7Ast.Node);
    },
    isPropertyAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.PropertyAccessExpression {
      return ts7AstInstance.isPropertyAccessExpression(node as ts7Ast.Node);
    },
    isElementAccessExpression(
      node: ProxyTypes.Node
    ): node is ProxyTypes.ElementAccessExpression {
      return ts7AstInstance.isElementAccessExpression(node as ts7Ast.Node);
    },
    isInterfaceDeclaration(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isInterfaceDeclaration(node as ts7Ast.Node);
    },
    isTypeAliasDeclaration(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isTypeAliasDeclaration(node as ts7Ast.Node);
    },
    isImportDeclaration(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isImportDeclaration(node as ts7Ast.Node);
    },
    isTypeOnlyExportDeclaration(node: ProxyTypes.Node): boolean {
      // almost same implementation of legacy typescript's isTypeOnlyExportDeclaration()
      const n = node as ts7Ast.Node;
      if (ts7AstInstance.isExportSpecifier(n)) {
        if (n.isTypeOnly) {
          return true;
        }
        const p1 = n.parent;
        if (p1 == null || !ts7AstInstance.isNamedExports(p1)) {
          return false;
        }
        const p2 = p1.parent;
        if (p2 == null || !ts7AstInstance.isExportDeclaration(p2)) {
          return false;
        }
        return p2.isTypeOnly;
      } else if (ts7AstInstance.isExportDeclaration(n)) {
        return n.isTypeOnly && !!n.moduleSpecifier && !n.exportClause;
      } else if (ts7AstInstance.isNamespaceExport(n)) {
        const p = n.parent;
        if (p == null || !ts7AstInstance.isExportDeclaration(p)) {
          return false;
        }
        return p.isTypeOnly;
      }
      return false;
    },
    isIdentifier(node: ProxyTypes.Node): node is ProxyTypes.Identifier {
      return ts7AstInstance.isIdentifier(node as ts7Ast.Node);
    },
    isComputedPropertyName(node: ProxyTypes.Node): boolean {
      return ts7AstInstance.isComputedPropertyName(node as ts7Ast.Node);
    },

    getTypeAtLocation(node: ProxyTypes.Node): ProxyTypes.Type | undefined {
      return getTypeAtLocation(node as ts7Ast.Node);
    },
    isEnumLiteral(type: ProxyTypes.Type): boolean {
      return isEnumLiteralType(type as ts7Api.Type, ts7ApiInstance);
    },
    isStringLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.StringLiteralType {
      return (
        ((type as ts7Api.Type).flags &
          ts7ApiInstance.TypeFlags.StringLiteral) !==
        0
      );
    },
    isNumberLiteral(
      type: ProxyTypes.Type
    ): type is ProxyTypes.NumberLiteralType {
      return (
        ((type as ts7Api.Type).flags &
          ts7ApiInstance.TypeFlags.NumberLiteral) !==
        0
      );
    },
    isBigIntLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts7Api.Type).flags &
          ts7ApiInstance.TypeFlags.BigIntLiteral) !==
        0
      );
    },
    isBooleanLiteral(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts7Api.Type).flags &
          ts7ApiInstance.TypeFlags.BooleanLiteral) !==
        0
      );
    },
    isNullType(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts7Api.Type).flags & ts7ApiInstance.TypeFlags.Null) !== 0
      );
    },
    isUndefinedType(type: ProxyTypes.Type): boolean {
      return (
        ((type as ts7Api.Type).flags & ts7ApiInstance.TypeFlags.Undefined) !== 0
      );
    },
    typeToString(type: ProxyTypes.Type): string {
      return typeChecker?.typeToString(type as ts7Api.Type) ?? '';
    },

    factory: {
      createIdentifier(text: string): ProxyTypes.Identifier {
        return ts7AstFactoryInstance.createIdentifier(text);
      },
      createStringLiteral(value: string): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createStringLiteral(value, 0);
      },
      createNumericLiteral(
        value: number | string
      ): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createNumericLiteral(`${value}`, 0);
      },
      createExpressionWithMinusToken(
        operand: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return ts7AstFactoryInstance.createParenthesizedExpression(
          ts7AstFactoryInstance.createPrefixUnaryExpression(
            ts7AstInstance.SyntaxKind.MinusToken,
            operand as ts7Ast.Expression
          )
        );
      },
      createBigIntLiteral(value: string): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createBigIntLiteral(value, 0);
      },
      createTrue(): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createKeywordExpression(
          ts7AstInstance.SyntaxKind.TrueKeyword
        );
      },
      createFalse(): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createKeywordExpression(
          ts7AstInstance.SyntaxKind.FalseKeyword
        );
      },
      createNull(): ProxyTypes.PrimaryExpression {
        return ts7AstFactoryInstance.createKeywordExpression(
          ts7AstInstance.SyntaxKind.NullKeyword
        );
      },
      createParenthesizedExpression(
        expression: ProxyTypes.Expression
      ): ProxyTypes.Expression {
        return ts7AstFactoryInstance.createParenthesizedExpression(
          expression as ts7Ast.Expression
        );
      },
      createVoidZero(): ProxyTypes.Expression {
        return ts7AstFactoryInstance.createParenthesizedExpression(
          ts7AstFactoryInstance.createVoidExpression(
            ts7AstFactoryInstance.createNumericLiteral('0', 0)
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
        node as ts7Ast.PropertyAccessExpression | ts7Ast.ElementAccessExpression
      );
    },
    isEnumIdentifier(node: ProxyTypes.Identifier): boolean {
      if (!typeChecker) {
        return false;
      }
      const type = getTypeAtLocation(node as ts7Ast.Identifier);
      return type != null && isEnumLiteralType(type, ts7ApiInstance);
    },
    isExternalReference(
      node: ProxyTypes.Node,
      externalNames: ReadonlyArray<string | RegExp>
    ): boolean {
      if (!typeChecker) {
        return false;
      }
      const nodeSym = typeChecker.getSymbolAtLocation(node as ts7Ast.Node);
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
        if (!ts7AstInstance.isImportSpecifier(n)) {
          break;
        }
        const baseName = n.propertyName ?? n.name;
        const baseSym = typeChecker.getSymbolAtLocation(baseName);
        // We must follow 'aliased' symbol for parsing the symbol which name is not changed from the exported symbol name
        const exportedSym =
          baseSym && baseSym.flags & ts7ApiInstance.SymbolFlags.Alias
            ? (getAliasedSymbol(
                typeChecker,
                project,
                baseSym,
                ts7ApiInstance,
                ts7AstInstance,
                ts7AstUtilsInstance
              ) ?? baseSym)
            : baseSym;
        const nextNodeFrom = exportedSym?.declarations?.[0];
        if (nextNodeFrom === nodeFrom) {
          break;
        }
        nodeFrom = nextNodeFrom;
      }
      const type = getTypeAtLocation(node as ts7Ast.Node);
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
        node as ts7Ast.Node,
        sourceFile as ts7Ast.SourceFile
      );
      const ranges = ts7AstInstance.getLeadingCommentRanges(fullText, 0) ?? [];
      for (const range of ranges) {
        if (range.kind !== ts7AstInstance.SyntaxKind.MultiLineCommentTrivia) {
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
      const node = _node as ts7Ast.Node;
      if (
        ts7AstInstance.isIdentifier(node) &&
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        node.parent &&
        !ts7AstInstance.isPropertyAccessExpression(node.parent)
      ) {
        const nodeSym = typeChecker.getSymbolAtLocation(node);
        if (nodeSym?.valueDeclaration) {
          let target: ts7Ast.Node | undefined =
            nodeSym.valueDeclaration.resolve(project);
          for (;;) {
            if (!target) {
              return false;
            }
            // Parameters are writable
            if (target.kind === ts7AstInstance.SyntaxKind.Parameter) {
              return false;
            }
            if (ts7AstInstance.isVariableDeclarationList(target)) {
              if (target.flags & ts7AstInstance.NodeFlags.Const) {
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
        ts7AstInstance.isPropertyAccessExpression(node) ||
        ts7AstInstance.isElementAccessExpression(node)
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
        | ts7Ast.PropertyAccessExpression
        | ts7Ast.ElementAccessExpression;
      const type = getTypeAtLocation(node.expression);
      const memberName = ts7AstInstance.isPropertyAccessExpression(node)
        ? node.name.text
        : getNameFromElementAccessExpression(node, typeChecker, ts7ApiInstance);
      if (memberName == null) {
        return false;
      }
      if (type != null && type.flags & ts7ApiInstance.TypeFlags.Object) {
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
        ts7AstInstance.isPropertyAccessExpression(parent as ts7Ast.Node) ||
        ts7AstInstance.isElementAccessExpression(parent as ts7Ast.Node)
      ) {
        return false;
      }
      const type = getTypeAtLocation(node as ts7Ast.Identifier);
      const sym = typeChecker.getSymbolAtLocation(node as ts7Ast.Identifier);
      if (!sym || sym.name !== 'undefined') {
        return false;
      }
      if (
        type == null ||
        type.flags & ts7ApiInstance.TypeFlags.UnionOrIntersection ||
        !(type.flags & ts7ApiInstance.TypeFlags.Undefined)
      ) {
        return false;
      }
      return true;
    },

    makeStringLiteralSource(value: string): string {
      // ts7 does not have escapeNonAsciiString
      return JSON.stringify(value);
    },
    getLineStarts(sourceFile: ProxyTypes.SourceFile): readonly number[] {
      return ts7AstInstance.computeLineStarts(sourceFile.text);
    },
  };
}

export function printSource(
  project: ts7Api.Project | null,
  sourceFile: ts7Ast.SourceFile,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils
): string {
  return printSourceWithProxy(
    sourceFile,
    makeTsgoProxy(
      project,
      ts7ApiInstance,
      ts7AstInstance,
      ts7AstFactoryInstance,
      ts7AstUtilsInstance
    )
  );
}

export function printSourceWithMap(
  project: ts7Api.Project | null,
  sourceFile: ts7Ast.SourceFile,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils,
  originalSourceName: string,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  return printSourceWithMapWithProxy(
    sourceFile,
    originalSourceName,
    makeTsgoProxy(
      project,
      ts7ApiInstance,
      ts7AstInstance,
      ts7AstFactoryInstance,
      ts7AstUtilsInstance
    ),
    startOfSourceMap
  );
}

export function transformSource(
  project: ts7Api.Project | null,
  sourceFile: ts7Ast.SourceFile,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils,
  options?: TransformOptions
): ts7Ast.SourceFile {
  const proxy = makeTsgoProxy(
    project,
    ts7ApiInstance,
    ts7AstInstance,
    ts7AstFactoryInstance,
    ts7AstUtilsInstance
  );
  return transformSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  ) as ts7Ast.SourceFile;
}

export function transformAndPrintSource(
  project: ts7Api.Project | null,
  sourceFile: ts7Ast.SourceFile,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils,
  options?: TransformOptions
): string {
  const proxy = makeTsgoProxy(
    project,
    ts7ApiInstance,
    ts7AstInstance,
    ts7AstFactoryInstance,
    ts7AstUtilsInstance
  );
  return transformAndPrintSourceWithProxy(
    sourceFile,
    proxy,
    undefined,
    options
  );
}

export function transformAndPrintSourceWithMap(
  project: ts7Api.Project | null,
  sourceFile: ts7Ast.SourceFile,
  ts7ApiInstance: typeof ts7Api,
  ts7AstInstance: typeof ts7Ast,
  ts7AstFactoryInstance: typeof ts7AstFactory,
  ts7AstUtilsInstance: typeof ts7AstUtils,
  originalSourceName: string,
  options?: TransformOptions,
  startOfSourceMap?: sourceMap.RawSourceMap
): [string, sourceMap.RawSourceMap] {
  const proxy = makeTsgoProxy(
    project,
    ts7ApiInstance,
    ts7AstInstance,
    ts7AstFactoryInstance,
    ts7AstUtilsInstance
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
