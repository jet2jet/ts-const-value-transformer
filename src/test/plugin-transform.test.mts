import { exec as execBase, type ExecException } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const exec = promisify(execBase);

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(THIS_DIR, '../..');
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

describe('use transformer in "plugins"', () => {
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
  });

  test('run tspc', async () => {
    const dist = path.join(TEST_PROJECT_DIR, 'dist');

    try {
      await fs.rm(dist, { force: true, recursive: true });
    } catch {}

    await exec(
      `tspc -p "${path.relative(PROJECT_DIR, path.join(TEST_PROJECT_DIR, 'tsconfig.json'))}"`
    );

    const files = await fs.readdir(dist, { recursive: true });
    expect(files).toMatchSnapshot('emitted files');
    await Promise.all(
      files.map(async (file) => {
        if (!/\.mjs$/i.test(file)) {
          return;
        }
        const content = await fs.readFile(path.join(dist, file), 'utf-8');
        expect(content).toMatchSnapshot(`emit file '${file}'`);
      })
    );
  });
});
