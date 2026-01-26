# Changelog

## v0.8.0

- Add `cacheResult` option (enable by default but disable by default for webpack loader)
- Fix for treating `as` expression (don't see parent expression)
- Fix some codes

## v0.7.1

- Fix to wrap import() with eval to prevent from static analysis

## v0.7.0

- Fix for printing 'minus numeric value' and 'void 0', and remove using `ts.createPrinter`
- Fix that `recreateProgram` creates the new fresh program instead of passing `oldProgram`
- Fix to cache source code with no transformation
- Add option to disable caching original source content (changed to false by default)
- Fix some codes for better memory usage

## v0.6.0

- Remove skipping satisfies expression
- Accept `undefined` for `context` and remove dependencies for `context`
- Fix referring `ts` instance and add `ts` parameter for printSource
- Add cache to createPortalTransformer
- Add `recreateProgramOnTransformCount` option for PortalTransformer
- Fix to use `createPortalTransformerSync` for webpack loader
- Search tsconfig before loading

## v0.5.1

- Fix missing for handling `ignoreFiles` for `createTransformer` (used from ts-loader, etc.)

## v0.5.0

- Add `useUndefinedSymbolForUndefinedValue` and `hoistUndefinedSymbol` options
- Add `createPortalTransformer` to use transformer easily
- Skip update process if unchanged
- Skip some declarations for performance
- Add hoisting computed property name
- Add test for element access
- Avoid hosting indexed property access
- Add test case for OmittedExpression and SatisfiesExpression
- Refactor to avoid handling unexpected expressions

## v0.4.1

Fix for not hositing some more unary expressions and parenthesized expression

## v0.4.0

Add `unsafeHoistWritableValues` option to prevent from hoisting non-const values with literal type unexpectedly

## v0.3.0

Add `externalNames` option for `hoistExternalValues`

## v0.2.1

Fix for tracing imported symbol

## v0.2.0

Add following options:

- `hoistEnumValues`
- `hoistExternalValues`
- `hoistPureFunctionCall`

## v0.1.1

Add `createTransformer` export point

## v0.1.0

Initial version.
