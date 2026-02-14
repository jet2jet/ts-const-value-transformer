import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  CreatePortalTransformerOptions,
  PortalTransformer,
} from '@/createPortalTransformer.mjs';
import type {
  CreatePortalTransformerWithTsLsOptions,
  PortalTransformerWithTsLs,
} from '@/createPortalTransformerWithTsLs.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

export function testPortalTransformer(
  createPortalTransformer: (
    options: CreatePortalTransformerOptions
  ) => Promise<PortalTransformer>
): void;
export function testPortalTransformer(
  createPortalTransformer: (
    options: CreatePortalTransformerWithTsLsOptions
  ) => Promise<PortalTransformerWithTsLs>
): void;

export function testPortalTransformer(
  createPortalTransformer: (
    options: CreatePortalTransformerOptions
  ) => Promise<PortalTransformer | PortalTransformerWithTsLs>
): void {
  describe('basic process', () => {
    it('test', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } catch (e: unknown) {
        console.error(e);
        throw e;
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });

    it('transform with explicitly specifying typescript package', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        typescript: 'typescript',
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });

    it('transforming causes unchanged', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'mod.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
  });
  describe('with options', () => {
    it('test with hoistProperty=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistProperty: false,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistEnumValues=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistEnumValues: false,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistExternalValues=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistExternalValues: false,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistExternalValues=false and additionalExternalDirectories', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistExternalValues: false,
        externalNames: ['/node_modules/', '/mod.mts'],
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with unsafeHoistFunctionCall', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistFunctionCall: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistPureFunctionCall', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistPureFunctionCall: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with unsafeHoistAsExpresion', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistAsExpresion: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with unsafeHoistWritableValues=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistWritableValues: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistUndefinedSymbol=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistUndefinedSymbol: false,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with useUndefinedSymbolForUndefinedValue=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        useUndefinedSymbolForUndefinedValue: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
    it('test with hoistConstTemplateLiteral=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistConstTemplateLiteral: true,
      });
      try {
        const result = transformer.transform(
          null,
          path.resolve(TEST_PROJECT_DIR, 'index.mts')
        );
        if (result[1]?.sources) {
          for (let i = 0; i < result[1].sources.length; ++i) {
            result[1].sources[i] = path.relative(
              path.resolve(TEST_PROJECT_DIR),
              result[1].sources[i]!
            );
          }
        }
        expect(result[0]).toMatchSnapshot('generated source');
        expect(result[1]).toMatchSnapshot('generated source map');
      } finally {
        if ('close' in transformer) {
          transformer.close();
        }
      }
    });
  });
}
