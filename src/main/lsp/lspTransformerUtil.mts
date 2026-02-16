import type * as sourceMap from 'source-map';
import * as ts from 'typescript';
import type TsLspClient from './TsLspClient.mjs';

const HOVER_CACHE_SYMBOL = Symbol('hover-cache');
interface NodeWithHoverCache extends ts.Node {
  [HOVER_CACHE_SYMBOL]: string;
}

const TYPE_CACHE_SYMBOL = Symbol('type-cache');
interface NodeWithTypeCache extends ts.Node {
  [TYPE_CACHE_SYMBOL]: [type: string, isEnum: boolean];
}

const READONLY_CACHE_SYMBOL = Symbol('read-only-cache');
interface NodeWithReadonlyCache extends ts.Node {
  [READONLY_CACHE_SYMBOL]: boolean;
}

const DEFINITION_CACHE_SYMBOL = Symbol('definition-cache');
interface NodeWithDefinitionCache extends ts.Node {
  [DEFINITION_CACHE_SYMBOL]: string | null;
}

function positionToLineAndColumn(
  sourceFile: ts.SourceFile,
  pos: number
): sourceMap.Position {
  const p = sourceFile.getLineAndCharacterOfPosition(pos);
  return { line: p.line, column: p.character };
}

function addToPositionByText(
  pos: sourceMap.Position,
  text: string
): sourceMap.Position {
  const r: sourceMap.Position = {
    line: pos.line,
    column: pos.column,
  };
  const textLines = text.split(/\r?\n/g);
  if (textLines.length > 1) {
    r.line += textLines.length - 1;
    r.column = textLines[textLines.length - 1]!.length;
  } else {
    r.column += text.length;
  }
  return r;
}

function getNodeFromPosition(
  sourceFile: ts.SourceFile,
  line: number,
  pos: number
) {
  const lines = sourceFile.getLineStarts();
  if (line >= lines.length) {
    line = lines.length - 1;
  }
  const nodePos = pos + lines[line]!;
  let foundNode: ts.Node | undefined;
  visit(sourceFile, undefined);
  return foundNode;

  function visit(node: ts.Node, parent: ts.Node | undefined): ts.Node {
    (node as { parent: ts.Node | undefined }).parent = parent;
    if (node.pos <= nodePos && node.end >= nodePos) {
      foundNode = node;
    }
    ts.visitEachChild(node, (n) => visit(n, node), undefined);
    return node;
  }
}

function isParentNode(
  target: ts.Node,
  child: ts.Node,
  stopNode?: ts.Node
): boolean {
  if (target === child) {
    return true;
  }
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  while (child.parent) {
    if (child.parent === target) {
      return true;
    }
    if (child.parent === stopNode) {
      break;
    }
    child = child.parent;
  }
  return false;
}

function getNodeLineAndColumn(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts
): sourceMap.Position {
  return positionToLineAndColumn(
    sourceFile,
    // For call expression, use end of position of expression (excluding arguments range)
    tsInstance.isCallExpression(node) ? node.expression.end : node.end
  );
}

function hoverResultToCode(result: [markdown: boolean, value: string]): string {
  let code = result[1];
  if (result[0]) {
    const ra =
      /```(`*)(?:ts|tsx|typescript|js|jsx|javascript)\s+([\s\S]*?)\s+```\1/.exec(
        code
      );
    if (ra) {
      code = ra[2]!;
    }
  }
  return code.trim();
}

function getHoverFromNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): string {
  if ((node as NodeWithHoverCache)[HOVER_CACHE_SYMBOL] != null) {
    return (node as NodeWithHoverCache)[HOVER_CACHE_SYMBOL];
  }
  const pos = getNodeLineAndColumn(node, sourceFile, tsInstance);
  const o = client.hoverForPosition(sourceFile.fileName, pos.line, pos.column);
  const code = hoverResultToCode(o);
  (node as NodeWithHoverCache)[HOVER_CACHE_SYMBOL] = code;
  return code;
}

function isFunctionLike(hover: string) {
  return (
    hover.startsWith('function') ||
    hover.startsWith('(local function)') ||
    hover.startsWith('(method)')
  );
}

function hoverToTypeString(
  node: ts.Node | null,
  hover: string,
  tsInstance: typeof ts
): string {
  if (hover.startsWith('(enum member)')) {
    hover = hover.slice(13);
    const s = tsInstance.createScanner(tsInstance.ScriptTarget.Latest, false);
    s.setText(hover);
    for (;;) {
      const t = s.scan();
      if (t === tsInstance.SyntaxKind.EqualsToken) {
        return hover.slice(s.getTokenEnd()).trim();
      } else if (t === tsInstance.SyntaxKind.EndOfFileToken) {
        return '';
      }
    }
  } else if (node && tsInstance.isIdentifier(node) && isFunctionLike(hover)) {
    if (hover.startsWith('function')) {
      hover = hover.slice(8);
    } else if (hover.startsWith('(local function)')) {
      hover = hover.slice(16);
    } else if (hover.startsWith('(method)')) {
      hover = hover.slice(8);
    }
    return hover.trim();
  } else {
    const s = tsInstance.createScanner(tsInstance.ScriptTarget.Latest, false);
    s.setText(hover);
    const tokenStack: ts.SyntaxKind[] = [];
    for (;;) {
      const t = s.scan();
      if (tokenStack.length > 0) {
        if (tokenStack[tokenStack.length - 1] === t) {
          tokenStack.pop();
        } else if (t === tsInstance.SyntaxKind.EndOfFileToken) {
          // Unexpected
          return '';
        }
        continue;
      }
      if (t === tsInstance.SyntaxKind.ColonToken) {
        return hover.slice(s.getTokenEnd()).trim();
      } else if (t === tsInstance.SyntaxKind.EndOfFileToken) {
        // Including indexed access
        return '';
      } else if (t === tsInstance.SyntaxKind.LessThanToken) {
        tokenStack.push(tsInstance.SyntaxKind.GreaterThanToken);
      } else if (t === tsInstance.SyntaxKind.OpenBraceToken) {
        tokenStack.push(tsInstance.SyntaxKind.CloseBraceToken);
      } else if (t === tsInstance.SyntaxKind.OpenBracketToken) {
        tokenStack.push(tsInstance.SyntaxKind.CloseBracketToken);
      } else if (t === tsInstance.SyntaxKind.OpenParenToken) {
        tokenStack.push(tsInstance.SyntaxKind.CloseParenToken);
      }
    }
  }
}

function hoverToFunctionReturnTypeString(
  node: ts.Node,
  hover: string,
  tsInstance: typeof ts
): string {
  const t = hoverToTypeString(node, hover, tsInstance);
  if (isFunctionLike(hover)) {
    return t;
  }
  if (t[0] !== '(') {
    return '';
  }
  // Search type string after '=>'
  const s = tsInstance.createScanner(tsInstance.ScriptTarget.Latest, false);
  s.setText(t);
  const tokenStack: ts.SyntaxKind[] = [];
  for (;;) {
    const t = s.scan();
    if (tokenStack.length > 0) {
      if (tokenStack[tokenStack.length - 1] === t) {
        tokenStack.pop();
      } else if (t === tsInstance.SyntaxKind.EndOfFileToken) {
        // Unexpected
        return '';
      }
      continue;
    }
    if (t === tsInstance.SyntaxKind.EqualsGreaterThanToken) {
      return hover.slice(s.getTokenEnd()).trim();
    } else if (t === tsInstance.SyntaxKind.EndOfFileToken) {
      // Unexpected
      return '';
    } else if (t === tsInstance.SyntaxKind.LessThanToken) {
      tokenStack.push(tsInstance.SyntaxKind.GreaterThanToken);
    } else if (t === tsInstance.SyntaxKind.OpenBraceToken) {
      tokenStack.push(tsInstance.SyntaxKind.CloseBraceToken);
    } else if (t === tsInstance.SyntaxKind.OpenBracketToken) {
      tokenStack.push(tsInstance.SyntaxKind.CloseBracketToken);
    } else if (t === tsInstance.SyntaxKind.OpenParenToken) {
      tokenStack.push(tsInstance.SyntaxKind.CloseParenToken);
    }
  }
}

function retrieveActualTypeString(
  fileName: string,
  pos: sourceMap.Position,
  tsIntance: typeof ts,
  client: TsLspClient
): [hover: string, type: string] {
  const def = client.getTypeDefitition(fileName, pos.line, pos.column);
  if (!def) {
    return ['', ''];
  }
  const o = client.hoverForPosition(def.fileName, def.lineEnd, def.posEnd);
  const code = hoverResultToCode(o);
  return [code, hoverToTypeString(null, code, tsIntance)];
}

function typeStringToLiteralType(
  typeString: string,
  tsInstance: typeof ts
): ts.TypeFlags | 0 {
  typeString = typeString.trim();
  if (typeString === '') {
    return 0;
  }
  if (typeString === 'null') {
    return tsInstance.TypeFlags.Null;
  }
  if (typeString === 'undefined') {
    return tsInstance.TypeFlags.Undefined;
  }
  if (typeString === 'true' || typeString === 'false') {
    return tsInstance.TypeFlags.BooleanLiteral;
  }
  // string literal
  if (/^(["']).*\1$/.test(typeString)) {
    return tsInstance.TypeFlags.StringLiteral;
  }
  // number / bigint
  const ra = /^-?[0-9]+(?:\.[0-9]*)?(n?)$/.exec(typeString);
  if (ra) {
    return ra[1] === 'n'
      ? tsInstance.TypeFlags.BigIntLiteral
      : tsInstance.TypeFlags.NumberLiteral;
  }
  return 0;
}

function performActualPropertyForElementAccessExpression<T>(
  node: ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient,
  perform: (posBeforeClose: sourceMap.Position) => T
): T {
  const a = node.argumentExpression;
  let replacedRange:
    | {
        start: sourceMap.Position;
        end: sourceMap.Position;
      }
    | undefined;
  if (!tsInstance.isLiteralExpression(a)) {
    // Temporary replace
    const rStart = positionToLineAndColumn(sourceFile, a.pos);
    const rEnd = positionToLineAndColumn(sourceFile, a.end);
    const t = nodeToTypeString(a, sourceFile, tsInstance, client);
    const flags = typeStringToLiteralType(t, tsInstance);
    if (flags !== 0) {
      client.sendReplaceText(
        sourceFile.fileName,
        rStart.line,
        rStart.column,
        rEnd.line,
        rEnd.column,
        t
      );
      replacedRange = {
        start: rStart,
        end: addToPositionByText(rStart, t),
      };
    }
  }

  const targetPos = replacedRange
    ? replacedRange.end
    : positionToLineAndColumn(sourceFile, a.end);
  const r = perform(targetPos);

  if (replacedRange) {
    // Restore replacement
    client.sendReplaceText(
      sourceFile.fileName,
      replacedRange.start.line,
      replacedRange.start.column,
      replacedRange.end.line,
      replacedRange.end.column,
      a.getFullText(sourceFile)
    );
  }
  return r;
}

function elementAccessExpressionToTypeString(
  node: ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): string {
  if ((node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] != null) {
    return (node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL][0];
  }

  const typeString = performActualPropertyForElementAccessExpression(
    node,
    sourceFile,
    tsInstance,
    client,
    (pos) => {
      const result = client.hoverForPosition(
        sourceFile.fileName,
        pos.line,
        pos.column
      );
      const hover = hoverResultToCode(result);
      (node as ts.Node as NodeWithHoverCache)[HOVER_CACHE_SYMBOL] = hover;
      let typeString = hoverToTypeString(node, hover, tsInstance);
      let isEnum = hover.startsWith('(enum member)');
      if (typeStringToLiteralType(typeString, tsInstance) === 0) {
        const t = retrieveActualTypeString(
          sourceFile.fileName,
          pos,
          tsInstance,
          client
        );
        if (t[1] !== '') {
          isEnum = t[0].startsWith('(enum member)');
          typeString = t[1];
        }
      }
      (node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] = [
        typeString,
        isEnum,
      ];
      return typeString;
    }
  );

  return typeString;
}

function templateExpressionToTypeString(
  node: ts.TemplateExpression,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): string {
  if ((node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] != null) {
    return (node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL][0];
  }
  // hack to retrieve actual literal type by using arrow function
  // - before: `foo ${'bar'}`
  // - after: (()=>(`foo ${'bar'}`) as const)()
  const text = node.getFullText(sourceFile);
  const rStart = positionToLineAndColumn(sourceFile, node.pos);
  const rEnd = positionToLineAndColumn(sourceFile, node.end);
  const replacedText = `(()=>(${text}) as const)()`;
  client.sendReplaceText(
    sourceFile.fileName,
    rStart.line,
    rStart.column,
    rEnd.line,
    rEnd.column,
    replacedText
  );

  const result = client.hoverForPosition(
    sourceFile.fileName,
    rStart.line,
    rStart.column + 4 // middle of arrow '=>' position
  );
  const hover = hoverResultToCode(result);
  (node as ts.Node as NodeWithHoverCache)[HOVER_CACHE_SYMBOL] = hover;
  const typeString = hoverToTypeString(node, hover, tsInstance);

  const rNewEnd = addToPositionByText(rStart, replacedText);
  // Restore replacement
  client.sendReplaceText(
    sourceFile.fileName,
    rStart.line,
    rStart.column,
    rNewEnd.line,
    rNewEnd.column,
    text
  );

  (node as ts.Node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] = [
    typeString,
    false,
  ];
  return typeString;
}

// @internal
export function nodeToTypeString(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): string {
  if ((node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] != null) {
    return (node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL][0];
  }
  if (tsInstance.isElementAccessExpression(node)) {
    return elementAccessExpressionToTypeString(
      node,
      sourceFile,
      tsInstance,
      client
    );
  }
  let typeString;
  let isEnum = false;
  if (tsInstance.isAsExpression(node)) {
    typeString = node.type.getText(sourceFile);
    if (typeString === 'const') {
      nodeToTypeString(node.expression, sourceFile, tsInstance, client);
      // use cached value instead of return value
      [typeString, isEnum] = (node.expression as ts.Node as NodeWithTypeCache)[
        TYPE_CACHE_SYMBOL
      ];
    }
  } else if (tsInstance.isStringLiteral(node)) {
    typeString = JSON.stringify(node.text);
  } else if (
    tsInstance.isNumericLiteral(node) ||
    tsInstance.isBigIntLiteral(node)
  ) {
    typeString = node.text;
  } else if (tsInstance.isTemplateExpression(node)) {
    typeString = templateExpressionToTypeString(
      node,
      sourceFile,
      tsInstance,
      client
    );
  } else {
    const hover = getHoverFromNode(node, sourceFile, tsInstance, client);
    if (tsInstance.isCallExpression(node)) {
      typeString = hoverToFunctionReturnTypeString(node, hover, tsInstance);
    } else {
      typeString = hoverToTypeString(node, hover, tsInstance);
    }
    isEnum = hover.startsWith('(enum member)');
  }
  if (typeStringToLiteralType(typeString, tsInstance) === 0) {
    const pos = getNodeLineAndColumn(node, sourceFile, tsInstance);
    const t = retrieveActualTypeString(
      sourceFile.fileName,
      pos,
      tsInstance,
      client
    );
    if (t[1] !== '') {
      isEnum = t[0].startsWith('(enum member)');
      typeString = t[1];
    }
  }
  (node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL] = [typeString, isEnum];
  return typeString;
}

// @internal
export function nodeToTypeFlags(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): ts.TypeFlags | 0 {
  const typeString = nodeToTypeString(node, sourceFile, tsInstance, client);
  let flags = typeStringToLiteralType(typeString, tsInstance);
  if ((node as NodeWithTypeCache)[TYPE_CACHE_SYMBOL][1]) {
    flags |= tsInstance.TypeFlags.EnumLiteral;
  }
  return flags;
}

function determineIfPropertyIsReadonly(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient,
  getSourceFile: ((fileName: string) => ts.SourceFile) | null
) {
  if (!getSourceFile) {
    return false;
  }
  let def;
  if (ts.isElementAccessExpression(node)) {
    def = performActualPropertyForElementAccessExpression(
      node,
      sourceFile,
      tsInstance,
      client,
      (pos) => client.getDefinition(sourceFile.fileName, pos.line, pos.column)
    );
  } else {
    const pos = positionToLineAndColumn(sourceFile, node.end);
    def = client.getDefinition(sourceFile.fileName, pos.line, pos.column);
  }
  if (!def) {
    return false;
  }
  const defSource = getSourceFile(def.fileName);
  const expr = getNodeFromPosition(defSource, def.lineEnd, def.posEnd);
  if (!expr) {
    return false;
  }
  let parent = expr.parent;
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  while (parent) {
    // For interface/type literal
    if (ts.isPropertySignature(parent)) {
      if (
        parent.modifiers?.some(
          (mod) => mod.kind === ts.SyntaxKind.ReadonlyKeyword
        )
      ) {
        return true;
      }
      break;
    } else if (ts.isAsExpression(parent)) {
      // For definition, 'as const' should be readonly
      if (parent.type.getText(defSource) === 'const') {
        return true;
      }
    } else if (ts.isEnumMember(parent)) {
      // Enum member is readonly
      return true;
    } else if (ts.isVariableDeclaration(parent)) {
      if (isParentNode(parent.name, expr, parent)) {
        const p = parent.parent;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (p && ts.isVariableDeclarationList(p)) {
          return (p.flags & ts.NodeFlags.Const) !== 0;
        }
      }
      // Reached to top level
      break;
    }
    if (parent.parent === parent) {
      break;
    }
    parent = parent.parent;
  }
  return false;
}

// @internal
export function isExpressionReadonly(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient,
  getSourceFile: ((fileName: string) => ts.SourceFile) | null
): boolean | null {
  if ((node as NodeWithReadonlyCache)[READONLY_CACHE_SYMBOL] != null) {
    return (node as NodeWithReadonlyCache)[READONLY_CACHE_SYMBOL];
  }
  if (
    !ts.isIdentifier(node) &&
    !ts.isPropertyAccessExpression(node) &&
    !ts.isElementAccessExpression(node)
  ) {
    return null;
  }
  if (ts.isIdentifier(node)) {
    if (
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      node.parent &&
      isUndefinedIdentifier(node, node.parent, sourceFile, tsInstance, client)
    ) {
      return true;
    }
    let hover = getHoverFromNode(node, sourceFile, tsInstance, client);
    if (hover.startsWith('(alias)')) {
      hover = hover.slice(7).trim();
      const lines = hover.split(/\r?\n/g);
      if (lines.length >= 2 && /^import\b/.test(lines[1]!.trim())) {
        return true;
      }
    }
    const isReadonly = /^const\b/.test(hover);
    (node as ts.Node as NodeWithReadonlyCache)[READONLY_CACHE_SYMBOL] =
      isReadonly;
    return isReadonly;
  }
  const isReadonly = determineIfPropertyIsReadonly(
    node,
    sourceFile,
    tsInstance,
    client,
    getSourceFile
  );
  (node as ts.Node as NodeWithReadonlyCache)[READONLY_CACHE_SYMBOL] =
    isReadonly;
  return isReadonly;
  // const typeString = nodeToTypeString(node, sourceFile, tsInstance, client);
  // if (typeStringToLiteralType(typeString, tsInstance) === 0) {
  //   return null;
  // }

  // const diagBefore = client.receiveDiagnostics(sourceFile.fileName);

  // // Replace expression with `(expression = typeString)` which should be error if expression is read-only

  // const text = node.getFullText(sourceFile);
  // const replacedText = `(${text} = ${typeString})`;
  // const rStart = positionToLineAndColumn(sourceFile, node.pos);
  // const rEnd = positionToLineAndColumn(sourceFile, node.end);
  // client.sendReplaceText(
  //   sourceFile.fileName,
  //   rStart.line,
  //   rStart.column,
  //   rEnd.line,
  //   rEnd.column,
  //   replacedText
  // );
  // const diagAfter = client.receiveDiagnostics(sourceFile.fileName);

  // const isReadonly = diagAfter.length > diagBefore.length;

  // // Restore text
  // const rNewEnd = addToPositionByText(rStart, replacedText);
  // client.sendReplaceText(
  //   sourceFile.fileName,
  //   rStart.line,
  //   rStart.column,
  //   rNewEnd.line,
  //   rNewEnd.column,
  //   text
  // );

  // (node as ts.Node as NodeWithReadonlyCache)[READONLY_CACHE_SYMBOL] =
  //   isReadonly;
  // return isReadonly;
}

// @internal
export function isExternalReference(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient,
  externalNames: ReadonlyArray<string | RegExp>
): boolean {
  if (
    (node as NodeWithDefinitionCache)[DEFINITION_CACHE_SYMBOL] === undefined
  ) {
    const pos = getNodeLineAndColumn(node, sourceFile, tsInstance);
    const def = client.getDefinition(sourceFile.fileName, pos.line, pos.column);
    (node as NodeWithDefinitionCache)[DEFINITION_CACHE_SYMBOL] =
      def != null ? def.fileName : null;
  }
  const defFile = (node as NodeWithDefinitionCache)[DEFINITION_CACHE_SYMBOL];
  if (defFile == null) {
    return false;
  }
  if (externalNames.length === 0) {
    return /[\\/]node_modules[\\/]/.test(defFile);
  } else {
    return externalNames.some((part) => {
      if (typeof part === 'string') {
        return defFile.replace(/\\/g, '/').includes(part);
      } else {
        return part.test(defFile);
      }
    });
  }
}

// @internal
export function isUndefinedIdentifier(
  node: ts.Identifier,
  parent: ts.Node,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): boolean {
  if (
    tsInstance.isPropertyAccessExpression(parent) ||
    tsInstance.isElementAccessExpression(parent)
  ) {
    return false;
  }
  if (node.getText(sourceFile)?.trim() !== 'undefined') {
    return false;
  }
  const typeFlags = nodeToTypeFlags(node, sourceFile, tsInstance, client);
  return (typeFlags & tsInstance.TypeFlags.Undefined) !== 0;
}

// @internal
export function isEnumAccess(
  node: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  sourceFile: ts.SourceFile,
  tsInstance: typeof ts,
  client: TsLspClient
): boolean {
  const hover = getHoverFromNode(node, sourceFile, tsInstance, client);
  return hover.startsWith('(enum member)');
}
