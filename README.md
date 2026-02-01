# ts-const-value-transformer

Transforms constant variables with actual literals in TypeScript project.
Provides 'transformer' for TypeScript building ecosystems, 'loader' for webpack, and transform and print APIs.

- [Motivation](#motivation)
- [Usage](#usage)
  - [Using transformer](#using-transformer)
  - [Using webpack loader](#using-webpack-loader)
  - [Transform options](#transform-options)
  - [APIs](#apis)
- [Additional notes](#additional-notes)
- [License](#license)

## Motivation

Usually, constant variables will be replaced with actual values by [terser](https://terser.org/), [swc](https://swc.rs/) or etc. ([swc example](https://play.swc.rs/?version=1.15.3&code=H4sIAAAAAAAAA9PXVygvyixJVcgvUihILAYykvNTUhUyUotSebl4uZLz84pLFBIVbBWqebkUFBKtFAx1QIwkKwUjMCPZSsGYl6vWGqI0PydVLyc%2FXSNRL1FHIVEvCUQkawIlAet2OZpnAAAA&config=H4sIAAAAAAAAA32US3LbMAyG9zmFR%2Bts20UPkF3PwKFJUKbDh4YAHWsyvnshSrLdGNJOwocfIAEQ32%2BHQ3dG0%2F05fPMn%2Fwy6IJT7P1twTKSvbOnARI2m%2BIG695WecUJOB4Rmus2kI116oKbCX4t7F3JGWN0XW%2FTJu%2FE5oclxKID4ZGMrx6sREuH%2F%2BoWV%2FDUBKvXZfsw5gE47RGlUPhH0UKTAJoegBwR10UWIMp1UF49ZSjHBSmDVUPIg8mQ9%2BZw45yu1oK0y2YKAfAFD%2FgKSjHOxLCFfT7hPwxaOte9bk3%2Bo4aJD1STkhGtrCZ9WiHrKHkm5mqQSznCjBjNcivtT6Z0qQLWkV905%2B7TRk08ArkDQiElHkOI2D8fztKV2u0qfHI8sjQLn%2BZZumaDnoirvnVDZqTJQyEvdLGCrgamyRjrOgjfKh96CAud4VoTQ%2BOXJnKSkNA6QnQC4v9pJUzUDdX%2BFG3x6EDv4g29J8oAtHlHTaZviGI857CSIQKdsdxy4FZS3ceEtcR22eU0WeDTAii4VG3hdAvwAKKvQluXLbPDz4IiqD%2Fn4WBOLw%2B2%2BhKNO%2FeO9z3v4bXHoYra1wWXDT%2F2d9%2FLv7uG0buH1BJ3Hv6uw5bz9A1EN%2Bh8sBgAA)), but if the variables are exported, the variables are not replaced ([swc example](https://play.swc.rs/?version=1.15.3&code=H4sIAAAAAAAAAyXKwQqAIBCE4bvgO8yxQIzqZvQwmy0VRBsqFETvXtZl%2BGD%2BqsIRlsSQgJ3iCy8jY%2BbAWmnlZYsJhB6XVgA51CZjcGg%2BeIdWq7v7U1nZrjIVZMmA7JDHl%2B%2FJ5y4h4aJcPrXX%2FP90AAAA&config=H4sIAAAAAAAAA32US3LbMAyG9zmFR%2Bts20UPkF3PwKFJUKbDh4YAHWsyvnshSrLdGNJOwocfIAEQ32%2BHQ3dG0%2F05fPMn%2Fwy6IJT7P1twTKSvbOnARI2m%2BIG695WecUJOB4Rmus2kI116oKbCX4t7F3JGWN0XW%2FTJu%2FE5oclxKID4ZGMrx6sREuH%2F%2BoWV%2FDUBKvXZfsw5gE47RGlUPhH0UKTAJoegBwR10UWIMp1UF49ZSjHBSmDVUPIg8mQ9%2BZw45yu1oK0y2YKAfAFD%2FgKSjHOxLCFfT7hPwxaOte9bk3%2Bo4aJD1STkhGtrCZ9WiHrKHkm5mqQSznCjBjNcivtT6Z0qQLWkV905%2B7TRk08ArkDQiElHkOI2D8fztKV2u0qfHI8sjQLn%2BZZumaDnoirvnVDZqTJQyEvdLGCrgamyRjrOgjfKh96CAud4VoTQ%2BOXJnKSkNA6QnQC4v9pJUzUDdX%2BFG3x6EDv4g29J8oAtHlHTaZviGI857CSIQKdsdxy4FZS3ceEtcR22eU0WeDTAii4VG3hdAvwAKKvQluXLbPDz4IiqD%2Fn4WBOLw%2B2%2BhKNO%2FeO9z3v4bXHoYra1wWXDT%2F2d9%2FLv7uG0buH1BJ3Hv6uw5bz9A1EN%2Bh8sBgAA)). But if the variables are strictly typed, the variables should be replaced probably safely.  
This package aims to replace those variables/property references/enum values with actual values, to reduce code side (and, perhaps, to increase execution speed).

## Usage

First, install with:

```sh
npm install --save-dev ts-const-value-transformer
```

### Using transformer

Transformer is a feature for TypeScript build system to convert parsed source code (AST) to another AST.
TypeScript compiler `tsc` does not accept transformers, but some TypeScript-related ecosystems such as
[ts-loader](https://www.npmjs.com/package/ts-loader) and [ts-patch](https://www.npmjs.com/package/ts-patch) accept transformers to intercept builds.

To use with ts-loader, write webpack configuration as follows:

```js
import { createTransformer } from 'ts-const-value-transformer';
// or: const { createTransformer } = require('ts-const-value-transformer');
// (you can use 'require' for ES modules starting from Node.js v20.19.0; see https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)

const yourWebpackConfiguration = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              getCustomTransformers: (program) => ({
                before: [
                  createTransformer(program, {
                    options: {
                      /* ts-const-value-transformer options (see below) */
                    },
                  }),
                ],
              }),
              // ...other configurations
            },
          },
        ],
      },
    ],
  },
  // ...other configurations
};
```

or:

```js
const yourWebpackConfiguration = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              // If you specify only one transformer, you can use 'ts-const-value-transformer/getCustomTransformers' module
              getCustomTransformers:
                'ts-const-value-transformer/getCustomTransformers',
              // ...other configurations
            },
          },
        ],
      },
    ],
  },
  // ...other configurations
};
```

To use with ts-patch, write tsconfig.json as follows:

```jsonc
  "compilerOptions": {
    // ...
    "plugins": [
      { "transform": "ts-const-value-transformer", "options": { /* ts-const-value-transformer options (see below) */ } }
    ]
  }
```

### Using webpack loader

You can use webpack loader for transformation. If you use loaders to transpile TS files other than ts-loader, `ts-const-value-transformer/loader` is a choice.  
Note that this may increase the build time because of parsing processes.

> If you are using ts-loader, you should use the transformer described above for performance reason.

```js
const yourWebpackConfiguration = {
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-typescript'],
            },
          },
          {
            loader: 'ts-const-value-transformer/loader',
            options; {
              project: 'tsconfig.json', // your tsconfig.json
              // typescript: 'typescript', // if you are using another 'typescript' package, you can specify the module name here
              // ... other options from `TransformOptions` fields
              // hoistProperty: false,
              // ...
            }
          },
        ],
      },
    ],
  },
  // ...other configurations
};
```

### Transform options

```ts
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
  /** Hoist `undefined` symbol to `void 0` (or `undefined` if useUndefinedSymbolForUndefinedValue is true). Default is true. */
  hoistUndefinedSymbol?: boolean | undefined;
  /**
   * External names (tested with `.includes()` for string, with `.test()` for RegExp) for `hoistExternalValues` settings (If `hoistExternalValues` is not specified, this setting will be used).
   * - Path separators for input file name are always normalized to '/' internally.
   * - Default is `['/node_modules/']`.
   */
  externalNames?: ReadonlyArray<string | RegExp> | undefined;
  /**
   * Specifies for file name list or function to skip transformation. This option is used by webpack loader, the transformed called from ts-loader, and createPortalTransformer only.
   * - For list, if the token is `string`, the transformation will be skipped if `fileName.indexOf(token) >= 0` is true.
   *   If the token is `RegExp`, the transformation will be skipped if `fileName.indexOf(token) >= 0` is true.
   * - For function, the transformation will be skipped if `fn(fileName)` is true.
   */
  ignoreFiles?:
    | ReadonlyArray<string | RegExp>
    | ((fileName: string) => boolean);
}
```

Note that you must pass `options` field to `createTransformer` function or `"plugins"` specifier (see above examples).

### APIs

```ts
import {
  createTransformer,
  printSource,
  printSourceWithMap,
  transformSource,
  version,
  type TransformOptions,
  createPortalTransformer,
  createPortalTransformerSync,
  type CreatePortalTransformerOptions,
  type PortalTransformer,
} from 'ts-const-value-transformer';
```

#### createTransformer: (program: ts.Program, config?: { options?: TransformOptions }, extras?: { ts?: typeof ts }) => ts.TransformerFactory<ts.SourceFile>

Used with TypeScript API or ts-loader.

Call example:

```js
import * as path from 'path';
import * as ts from 'typescript';
import { createTransformer } from 'ts-const-value-transformer';

const PROJECT_DIR = path.resolve('.');

// Load tsconfig.json file
const configFile = ts.readJsonConfigFile(
  path.resolve(PROJECT_DIR, 'tsconfig.json'),
  ts.sys.readFile
);
const config = ts.parseJsonSourceFileConfigFileContent(
  configFile,
  ts.sys,
  PROJECT_DIR
);

// Initialize the program
const program = ts.createProgram({
  options: config.options,
  rootNames: config.fileNames,
});

// Load the source file to transform
const fileName = path.resolve(PROJECT_DIR, 'index.mts');
const sourceFile = program.getSourceFile(fileName)!;

// Do transform
const transformer = createTransformer(program);
const result = ts.transform(
  sourceFile,
  [transformer],
  program.getCompilerOptions()
);
const transformedSource = result.transformed[0]!;
// You can emit the transformed code by using `printSource` (see below):
//   console.log(printSource(transformedSource));
```

#### printSource: (sourceFile: ts.SourceFile) => string

Prints (generates) source code from `SourceFile`. The source file must be one generated by `transformSource` or existing in the TS project (available with `getSourceFile()` in `ts.Program`).

#### printSourceWithMap: (sourceFile: ts.SourceFile, originalSourceName: string, startOfSourceMap?: RawSourceMap) => [string, RawSourceMap]

Prints (generates) source code from `SourceFile`, along with raw source-map data. The source file must be one generated by `transformSource` or existing in the TS project (available with `getSourceFile()` in `ts.Program`).

- `originalSourceName` would be the file name of `sourceFile`, but you can specify another name.
- `startOfSourceMap` is a base source map (if original source file is a generated-content) if available.

#### transformAndPrintSource: (sourceFile: ts.SourceFile, program: ts.Program, context: ts.TransformationContext | undefined, options?: TransformOptions) => string

Transforms the source file with TypeScript project and prints a new source code. This acts like combination of `transformSource` and `printSource`, but performs in one loop, so if transformed AST is not necessary, this function is suitable.

#### transformAndPrintSourceWithMap: (sourceFile: ts.SourceFile, program: ts.Program, context: ts.TransformationContext | undefined, originalSourceName: string, options?: TransformOptions, startOfSourceMap?: RawSourceMap) => [string, RawSourceMap]

Transforms the source file with TypeScript project and prints a new source code. This acts like combination of `transformSource` and `printSourceWithMap`, but performs in one loop, so if transformed AST is not necessary, this function is suitable.

- `originalSourceName` would be the file name of `sourceFile`, but you can specify another name.
- `startOfSourceMap` is a base source map (if original source file is a generated-content) if available.

#### transformSource: (sourceFile: ts.SourceFile, program: ts.Program, context: ts.TransformationContext, options?: TransformOptions) => ts.SourceFile

Transforms the source file with TypeScript project. You don't need to call this function directly; use `createTransformer` or `createPortalTransformer` instead.

Note that `ignoreFiles` of `options` will be ignored for this function.

#### version: string

The version string of this package.

#### type TransformOptions

See [Transform options](#transform-options).

#### createPortalTransformer: (options?: CreatePortalTransformerOptions) => Promise<PortalTransformer>

Creates 'portal transformer', which can be used the transformer easily from the code which does not use TypeScript Compiler API.  
The return object has `transform` method with signature: `(content: string, fileName: string, sourceMap?: string | RawSourceMap | null, options?: TransformOptions) => [newSource: string, newSourceMap: RawSourceMap | undefined]`. You can call to transform TypeScript source code. (Note that this API does not transpile to JavaScript; the output code is still TypeScript code.)

`CreatePortalTransformerOptions` has a following signature. Also, `TransformOptions` fields, including `ignoreFiles`, can be used.

```ts
interface CreatePortalTransformerOptions extends TransformOptions {
  /** Path to tsconfig.json. If omitted, `tsconfig.json` will be used. */
  project?: string;
  /** Package path to `typescript` or `typescript` namespace object. */
  typescript?: string | typeof tsNamespace;
  /** The current directory for file search. Also affects to `project` option. */
  cwd?: string;
  /**
   * Speficies the count. When the transformation count reaches this value, `program` instance will be recreated (and count will be reset).
   * This is useful if the project is big and out-of-memory occurs during transformation, but the process may be slower.
   * If 0 or `undefined`, recreation will not be performed.
   */
  recreateProgramOnTransformCount?: number;
  /** Specifies to cache base (original) source code for check if the input is changed. Default is false. */
  cacheBaseSource?: boolean;
  /** Specifies to cache result source code. Default is true (false for webpack loader). If the latter process has cache system, specifies false to reduce memory usage. */
  cacheResult?: boolean;
}
```

If `Promise` cannot be used for some reason, use `createPortalTransformerSync` instead.

## Notice

Starting from v0.4.0, `unsafeHoistWritableValues` option is introduced. Since TypeScript sometimes narrows non-constant values to literal types such as:

```ts
const resultObject = { success: false };
someFunc1(resultObject);
console.log(resultObject.success); // resultObject.success will be `boolean` type
resultObject.success = false;
someFunc1(resultObject);
console.log(resultObject.success); // resultObject.success will be `false` type, not `boolean`
```

... so if `unsafeHoistWritableValues` is true, the second reference of `resultObject.success` above will be replaced to `false`, which may not be correct.

## Additional notes

I think there should be more optimization methods by using strictly-typed information, like other programming languages.

## License

[MIT License](./LICENSE)
