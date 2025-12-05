import * as ts from 'typescript';
import { versionMajorMinor as vmm } from 'typescript';
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
  constValue1 ? constValue2 : constValue3
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

// External values
console.log(ts.SyntaxKind.AnyKeyword, ts.versionMajorMinor, vmm);

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
  constObject.h.h2.toString()
);

// don't transform here
declare let o: object;
console.log((o as typeof constObject).a);
console.log((o as typeof constObject).h.h1);

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

export {};
