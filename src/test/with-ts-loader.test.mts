import { exec as execBase, type ExecException } from 'child_process';
import * as fs from 'fs/promises';
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import type * as tsloaderNamespace from 'ts-loader';
import type * as webpackNamespace from 'webpack';
import createTransformer from '@/createTransformer.mjs';
type WebpackFunction = typeof webpackNamespace.default;
const require = createRequire(import.meta.url);
const memFs = require('memfs') as typeof import('memfs');
const webpack = require('webpack') as WebpackFunction;

const exec = promisify(execBase);

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(THIS_DIR, '../..');
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

describe('loader', () => {
  it('test', async () => {
    const volume = new memFs.Volume();
    const fsInMemory = memFs.createFsFromVolume(volume);
    const compiler = webpack({
      mode: 'production',
      module: {
        rules: [
          {
            test: /\.mts$/,
            use: [
              {
                loader: 'ts-loader',
                options: {
                  configFile: path.resolve(TEST_PROJECT_DIR, 'tsconfig.json'),
                  getCustomTransformers: (program) => ({
                    before: [createTransformer(program)],
                  }),
                } satisfies Partial<tsloaderNamespace.Options>,
              },
            ],
          },
        ],
      },
      devtool: 'source-map',
      resolve: {
        extensionAlias: {
          '.mjs': ['.mts', '.mjs'],
        },
      },
      entry: {
        index: path.resolve(TEST_PROJECT_DIR, 'index.mts'),
      },
      // for test, don't bundle 'typescript' module
      externals: {
        typescript: {
          root: 'typescript',
        },
      },
      output: {
        path: '/dummy',
        library: {
          type: 'commonjs',
        },
      },
    });

    compiler.outputFileSystem = fsInMemory as webpackNamespace.OutputFileSystem;
    await new Promise<webpackNamespace.Stats>((resolve, reject) => {
      compiler.run((err, result: webpackNamespace.Stats | undefined) => {
        if (result) {
          if (result.hasErrors()) {
            reject(result.compilation.errors[0]);
          } else {
            resolve(result);
          }
        } else {
          reject(err);
        }
      });
    });
    const jsFile = volume.readFileSync('/dummy/index.js', 'utf-8').toString();
    const mapFile = volume
      .readFileSync('/dummy/index.js.map', 'utf-8')
      .toString();
    expect(jsFile).toMatchSnapshot('generated source');
    expect(JSON.parse(mapFile)).toMatchSnapshot('generated source map');
  }, 15000);

  describe('with webpack cli', () => {
    beforeAll(async () => {
      process.chdir(PROJECT_DIR);
      console.log('Run `npm run build` before running tests.');
      try {
        await exec(`npm run build`);
        console.log('Building finished.');
      } catch (e) {
        console.log('Build failure');
        if (typeof e === 'object' && e && 'stdout' in e) {
          console.log((e as ExecException).stdout);
        }
        throw e;
      }
    }, 20000);

    test('run webpack', async () => {
      const dist = path.join(TEST_PROJECT_DIR, 'dist2');

      try {
        await fs.rm(dist, { force: true, recursive: true });
      } catch {}

      await exec(
        `webpack --config "${path.join(THIS_DIR, 'webpack.config.cjs')}"`
      );

      const files = await fs.readdir(dist, { recursive: true });
      expect(files).toMatchSnapshot('emitted files');
      await Promise.all(
        files.map(async (file) => {
          if (!/\.js$/i.test(file)) {
            return;
          }
          const content = await fs.readFile(path.join(dist, file), 'utf-8');
          expect(content).toMatchSnapshot(`emit file '${file}'`);
        })
      );
    }, 20000);
  });
});
