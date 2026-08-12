import type * as tsNamespace from 'typescript';

export function isTypeScript7(ts: typeof tsNamespace): boolean {
  if ('version' in ts) {
    const ver = ts.version.split('.').map((t) => Number(t));
    if (ver.length < 3) {
      throw new Error(`Unknown typescript version: ${ts.version}`);
    }
    if (ver[0]! < 5) {
      throw new Error(`Too old typescript version (actual: ${ts.version})`);
    }
    if (ver[0]! >= 7) {
      if (ver[0]! > 7 || ver[1] !== 0) {
        throw new Error(`Unsupported typescript version: ${ts.version}`);
      }
      return true;
    }
  }
  return false;
}
