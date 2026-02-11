// This file is used by with-ts-loader.test.mts to use `getCustomTransformers` with string value

const path = require('path');

const THIS_DIR = __dirname;
const PROJECT_DIR = path.resolve(THIS_DIR, '../..');
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

/** @type {import('webpack').Configuration} */
const config = {
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.mts$/,
        use: [
          {
            loader: 'ts-loader',
            options: /** @satisfies {import('ts-loader').Options} */ ({
              configFile: path.resolve(TEST_PROJECT_DIR, 'tsconfig.json'),
              getCustomTransformers: path.resolve(
                PROJECT_DIR,
                'dist/getCustomTransformers.mjs'
              ),
            }),
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
    path: path.resolve(TEST_PROJECT_DIR, 'dist2'),
    library: {
      type: 'commonjs',
    },
  },
  stats: 'verbose',
};
module.exports = config;
