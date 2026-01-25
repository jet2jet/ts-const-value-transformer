import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPortalTransformer } from '@/index.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

describe('createPortalTransformer', () => {
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
