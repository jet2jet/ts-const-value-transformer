import * as ts from 'typescript';
import { versionMajorMinor as vmm } from 'typescript';
import { versionMajorMinor } from 'typescript';
import * as mod from './mod.mjs';

const constValue1 = 1;
const constValue2 = 0.1;
const constValue3 = -1;
const constValue4 = 'foo';
const constValue5 = true;
const constValue6 = 10n;
const constValue7 = -10n;
const constValue8 = `aaa
bbb`;
declare let n: number;
const constValue9 = `bbb${n}`;
const constValue10 = !0;
const constValue11 = undefined;
let writableValue1 = true;

console.log(
  constValue1,
  constValue2,
  constValue3,
  /* the comment */
  /* the comment */
  constValue4,
  /* the comment */
  constValue5,
  constValue6 /* the comment */,
  constValue7,
  /* the comment */
  constValue8.toString() /* the comment */,
  // don't transform because constValue9 is not a literal type
  constValue9.toString(),
  // don't transform for asserted type
  (n as 10).toString(),
  constValue10,
  // 'constValue11 || 12345' is literal type, but don't transform (instead transform 'constValue11')
  constValue11 || 12345,
  // 'constValue1 ? constValue2 : constValue3' is literal type, but don't transform
  constValue1 ? constValue2 : constValue3,
  // writableValue1 is literal type, but don't transform unless `unsafeHoistWritableValues` is true
  writableValue1
);
export {
  constValue1,
  constValue2,
  constValue3,
  constValue4,
  constValue5,
  constValue6,
  constValue7,
  constValue8,
  constValue9,
};
setWritableValue1();
if (constValue1 && (writableValue1 || !constValue5)) {
  console.log('');
}

// Test code for print
console.log(
  -constValue3,
  -constValue1.toString(),
  constValue2.toString(),
  constValue3.toString(),
  constValue10.toString()
);

function setWritableValue1() {
  writableValue1 = !!Math.random();
}

// External values
console.log(
  ts.SyntaxKind.AnyKeyword,
  ts.versionMajorMinor,
  versionMajorMinor,
  vmm
);

console.log(mod.Hoge, (n as number) === mod.Hoge || (n as number) === mod.Piyo);

export const constObject = {
  a: 4,
  b: 'bar',
  c: false,
  d: null,
  e: undefined,
  f: 20n,
  g: -30n,
  h: {
    h1: constValue1,
    h2: -3.14,
    h3: {},
  },
} as const;
console.log(
  constObject.a,
  constObject.b,
  constObject.c,
  constObject.d,
  constObject.e,
  constObject.f,
  constObject.g,
  constObject.h,
  constObject.h.h1,
  constObject.h.h2,
  constObject.h.h3,
  //
  constObject.a.toString(),
  constObject.b.toString(),
  constObject.c.toString(),
  constObject.f.toString(),
  constObject.g.toString(),
  constObject.h.h1.toString(),
  constObject.h.h2.toString(),
  // element accesses are hoistable by default
  constObject['a'],
  constObject['d']
);

// don't transform here unless unsafeHoistAsExpresion is true
declare let o: object;
console.log((o as typeof constObject).a);
console.log((o as typeof constObject)['a']);
console.log((o as typeof constObject).h.h1);
console.log((o as typeof constObject).h['h1']);

const nonConstObject = {
  a: true,
  b: 1,
};
nonConstObject.a = false;
nonConstObject.b = 2;
// don't transform `a` unless `unsafeHoistWritableValues` is true
console.log(nonConstObject.a, nonConstObject.b);

interface WithReadonlyObject {
  p: number | null;
  readonly q: 'q';
  readonly r: {
    s: boolean;
    readonly t: 2;
  };
}
const partialConstObject: WithReadonlyObject = {
  p: 1,
  q: 'q',
  r: {
    s: false,
    t: 2,
  },
};
partialConstObject.p = null;
partialConstObject.r.s = true;
// don't transform `p` and `r.s` unless `unsafeHoistWritableValues` is true
console.log(
  partialConstObject.p,
  partialConstObject.q,
  partialConstObject.r.s,
  partialConstObject.r.t
);

const enum BarEnum {
  A = 1,
  B = 'hoge',
}
console.log(BarEnum.A, BarEnum.B);

enum BazEnum {
  C = 2,
  D = 'piyo',
}
console.log(BazEnum.C, BazEnum.D);
// element access
console.log(BazEnum['C'], BazEnum['D']);

// Element access with constant name
const name_a = 'a';
console.log(constObject[name_a]);

// Object initializer with computed name
const objWithComputedName = { [name_a]: 432 } as const;
console.log(objWithComputedName[name_a]);

(() => {
  const { a, b: b2, e = constValue3 } = constObject;
  console.log(a, b2, e);
})();

((x: number = constValue2) => {
  console.log(x);
})();

function fn2() {
  return 12345 as const;
}
console.log(fn2());
// with annotation
console.log(/*@__PURE__*/ fn2(), /*#__PURE__*/ fn2());

// don't transform spread element and parameter declarations
console.log([...Array<undefined>(5)].map((u, i) => (u == null ? i : 0)));
const fn1 = (...args: undefined[]) => args.length;
console.log(fn1(...Array<undefined>(5)));

// don't transform omitted expression
const tuple = [1, 2] as const;
const [, tuple2] = tuple;
console.log(tuple2);

// don't transform satisfies expression
tuple2 satisfies 2;
switch (tuple2) {
  case 2:
    break;
  default:
    tuple2 satisfies never;
    break;
}

// don't transform assignment
const record1: Record<string, true> = {};
record1.foo = true;
record1['bar'] = true;
// don't transform indexed access
console.log(record1.foo, record1.baz);

// do transform constant values in initializers
const value1 = constValue1;
const array1 = [constValue1, constValue2] as const;
const array2 = [constValue3, constValue4] as const satisfies ReadonlyArray<
  string | number
>;
const object1 = {
  x: constValue3,
  constValue4,
  y: mod.Hoge,
  z: BarEnum.B,
} satisfies Record<string, unknown>;
console.log(value1, array1, array2, object1);

// for `as` expression
const as_1 = [constValue1, constValue2] as number[]; // do transform
const as_2 = constObject.b as string; // do transform
const as_3 = [BarEnum.A as number, BarEnum.B as string].includes(2); // do transform
const as_4 = (constObject as { readonly b: 'bar' }).b; // don't transform unless unsafeHoistAsExpresion
console.log(as_1, as_2, as_3, as_4);

// for multiline expression
// e.g. `as XXX` requires to have an expression in the same line ('X as Y' is ok, 'X\n as Y' is invalid)
console.log(
  constObject[
    // here
    'f'
  ] as unknown
);
function multilineTest() {
  return constObject[
    /* here */
    'a'
  ].toFixed(2);
}
console.log(multilineTest());

export {};
