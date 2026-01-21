import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type * as webpackNamespace from 'webpack';
type WebpackFunction = typeof webpackNamespace.default;
const require = createRequire(import.meta.url);
const memFs = require('memfs') as typeof import('memfs');
const webpack = require('webpack') as WebpackFunction;

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
                  // this is necessary because `transpileOnly = false` will read real file content instead of loader input
                  transpileOnly: true,
                },
              },
              {
                loader: path.resolve(PROJECT_DIR, 'src/main/loader.mts'),
                options: {
                  project: path.resolve(TEST_PROJECT_DIR, 'tsconfig.json'),
                },
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

  it('transforming causes unchanged', async () => {
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
                  // this is necessary because `transpileOnly = false` will read real file content instead of loader input
                  transpileOnly: true,
                },
              },
              {
                loader: path.resolve(PROJECT_DIR, 'src/main/loader.mts'),
                options: {
                  project: path.resolve(TEST_PROJECT_DIR, 'tsconfig.json'),
                },
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
        index: path.resolve(TEST_PROJECT_DIR, 'mod.mts'),
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
});
