import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  CreatePortalTransformerOptions,
  PortalTransformer,
} from '@/createPortalTransformer.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

export function testPortalTransformer(
  createPortalTransformer: (
    options: CreatePortalTransformerOptions
  ) => Promise<PortalTransformer>
): void {
  describe('basic process', () => {
    it('test', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
      });
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
    });

    it('transform with explicitly specifying typescript package', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        typescript: 'typescript',
      });
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
    });

    it('transforming causes unchanged', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
      });
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
    });
  });
  describe('with options', () => {
    it('test with hoistProperty=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistProperty: false,
      });
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
    });
    it('test with hoistEnumValues=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistEnumValues: false,
      });
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
    });
    it('test with hoistExternalValues=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistExternalValues: false,
      });
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
    });
    it('test with hoistExternalValues=false and additionalExternalDirectories', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistExternalValues: false,
        externalNames: ['/node_modules/', '/mod.mts'],
      });
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
    });
    it('test with unsafeHoistFunctionCall', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistFunctionCall: true,
      });
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
    });
    it('test with hoistPureFunctionCall', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistPureFunctionCall: true,
      });
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
    });
    it('test with unsafeHoistAsExpresion', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistAsExpresion: true,
      });
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
    });
    it('test with unsafeHoistWritableValues=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        unsafeHoistWritableValues: true,
      });
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
    });
    it('test with hoistUndefinedSymbol=false', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistUndefinedSymbol: false,
      });
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
    });
    it('test with useUndefinedSymbolForUndefinedValue=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        useUndefinedSymbolForUndefinedValue: true,
      });
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
    });
    it('test with hoistConstTemplateLiteral=true', async () => {
      const transformer = await createPortalTransformer({
        project: 'tsconfig.json',
        cwd: path.resolve(TEST_PROJECT_DIR),
        hoistConstTemplateLiteral: true,
      });
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
    });
  });
}
