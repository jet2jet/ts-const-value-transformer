// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ProxyTypes {
  export interface TextRange {
    readonly pos: number;
    readonly end: number;
  }
  export interface Node {
    readonly pos: number;
    readonly end: number;
  }
  export interface SourceFile extends Node {
    readonly text: string;
  }
  export interface Expression extends Node {
    _expressionBrand?: any;
  }
  export interface UnaryExpression extends Expression {
    _unaryExpressionBrand?: any;
  }
  export interface UpdateExpression extends UnaryExpression {
    _updateExpressionBrand?: any;
  }
  export interface LeftHandSideExpression extends UpdateExpression {
    _leftHandSideExpressionBrand?: any;
  }
  export interface MemberExpression extends LeftHandSideExpression {
    _memberExpressionBrand?: any;
  }
  export interface PrimaryExpression extends MemberExpression {
    _primaryExpressionBrand?: any;
  }
  export interface Identifier extends PrimaryExpression {
    readonly text: string;
  }
  export interface PrivateIdentifier extends PrimaryExpression {
    readonly escapedText: string;
  }
  export type MemberName = Identifier | PrivateIdentifier;
  export interface ElementAccessExpression extends MemberExpression {
    readonly argumentExpression: Expression;
  }
  export interface PropertyAccessExpression extends MemberExpression {
    readonly expression: LeftHandSideExpression;
    readonly name: MemberName;
  }

  export interface Type {
    readonly flags: number;
  }
  export interface StringLiteralType extends Type {
    readonly value: string;
  }
  export interface NumberLiteralType extends Type {
    readonly value: number;
  }
}

export interface ApiProxy<TTransformationContext = void> {
  // Nodes
  visitEachChild<T extends ProxyTypes.Node>(
    node: T,
    visitor: (
      node: ProxyTypes.Node
    ) => ProxyTypes.Node | readonly ProxyTypes.Node[] | undefined,
    context: TTransformationContext | undefined
  ): T;
  getNodeText(node: ProxyTypes.Node, sourceFile: ProxyTypes.SourceFile): string;
  getNodeFullText(
    node: ProxyTypes.Node,
    sourceFile: ProxyTypes.SourceFile
  ): string;
  appendMultiLineComment<Node extends ProxyTypes.Node>(
    node: Node,
    comment: string
  ): Node;
  setTextRange<T extends ProxyTypes.TextRange>(
    range: T,
    location: ProxyTypes.TextRange | undefined
  ): T;
  isExpression(node: ProxyTypes.Node): node is ProxyTypes.Expression;
  isAsExpression(node: ProxyTypes.Node): boolean;
  isCallLikeExpression(node: ProxyTypes.Node): boolean;
  isTemplateExpression(node: ProxyTypes.Node): boolean;
  isPropertyAccessExpression(
    node: ProxyTypes.Node
  ): node is ProxyTypes.PropertyAccessExpression;
  isElementAccessExpression(
    node: ProxyTypes.Node
  ): node is ProxyTypes.ElementAccessExpression;
  isInterfaceDeclaration(node: ProxyTypes.Node): boolean;
  isTypeAliasDeclaration(node: ProxyTypes.Node): boolean;
  isImportDeclaration(node: ProxyTypes.Node): boolean;
  isTypeOnlyExportDeclaration(node: ProxyTypes.Node): boolean;
  isIdentifier(node: ProxyTypes.Node): node is ProxyTypes.Identifier;
  isComputedPropertyName(node: ProxyTypes.Node): boolean;

  // Types
  getTypeAtLocation(
    node: ProxyTypes.Node,
    sourceFile: ProxyTypes.SourceFile
  ): ProxyTypes.Type | undefined;
  isEnumLiteral(type: ProxyTypes.Type): boolean;
  isStringLiteral(type: ProxyTypes.Type): type is ProxyTypes.StringLiteralType;
  isNumberLiteral(type: ProxyTypes.Type): type is ProxyTypes.NumberLiteralType;
  isBigIntLiteral(type: ProxyTypes.Type): boolean;
  isBooleanLiteral(type: ProxyTypes.Type): boolean;
  isNullType(type: ProxyTypes.Type): boolean;
  isUndefinedType(type: ProxyTypes.Type): boolean;
  typeToString(type: ProxyTypes.Type): string;

  // factory
  factory?: {
    createIdentifier(text: string): ProxyTypes.Identifier;
    createStringLiteral(value: string): ProxyTypes.PrimaryExpression;
    createNumericLiteral(value: number | string): ProxyTypes.PrimaryExpression;
    createExpressionWithMinusToken(
      operand: ProxyTypes.Expression
    ): ProxyTypes.Expression;
    createBigIntLiteral(value: string): ProxyTypes.PrimaryExpression;
    createTrue(): ProxyTypes.PrimaryExpression;
    createFalse(): ProxyTypes.PrimaryExpression;
    createNull(): ProxyTypes.PrimaryExpression;
    createParenthesizedExpression(
      expression: ProxyTypes.Expression
    ): ProxyTypes.Expression;
    createVoidZero(): ProxyTypes.Expression;
  };

  // Misc.
  isEnumAccess(
    node:
      | ProxyTypes.PropertyAccessExpression
      | ProxyTypes.ElementAccessExpression,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;
  isEnumIdentifier(
    node: ProxyTypes.Identifier,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;
  isExternalReference(
    node: ProxyTypes.Node,
    externalNames: ReadonlyArray<string | RegExp>,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;
  hasPureAnnotation(
    node: ProxyTypes.Node,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;
  /** Return `null` if not a target */
  isReadonlyExpression(
    node: ProxyTypes.Node,
    sourceFile: ProxyTypes.SourceFile
  ): boolean | null;
  isHoistablePropertyAccess(
    node:
      | ProxyTypes.PropertyAccessExpression
      | ProxyTypes.ElementAccessExpression,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;
  isUndefinedIdentifier(
    node: ProxyTypes.Identifier,
    parent: ProxyTypes.Node,
    sourceFile: ProxyTypes.SourceFile
  ): boolean;

  makeStringLiteralSource(value: string): string;
  getLineStarts(sourceFile: ProxyTypes.SourceFile): readonly number[];
}
