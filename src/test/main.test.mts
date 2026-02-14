import * as path from 'path';
import { fileURLToPath } from 'url';
import * as ts from 'typescript';
import { createTransformer, printSourceWithMap } from '@/index.mjs';

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
const TEST_PROJECT_DIR = path.resolve(THIS_DIR, '../test-project');

function prepareSource(): [ts.Program, ts.SourceFile] {
  const configFile = ts.readJsonConfigFile(
    path.resolve(TEST_PROJECT_DIR, 'tsconfig.json'),
    // eslint-disable-next-line @typescript-eslint/unbound-method
    ts.sys.readFile
  );
  const config = ts.parseJsonSourceFileConfigFileContent(
    configFile,
    ts.sys,
    TEST_PROJECT_DIR
  );

  const program = ts.createProgram({
    options: config.options,
    rootNames: config.fileNames,
  });

  const fileName = path.resolve(TEST_PROJECT_DIR, 'index.mts');
  const sourceFile = program.getSourceFile(fileName)!;
  expect(sourceFile).not.toBeUndefined();
  return [program, sourceFile];
}

describe('createTransformer and printSourceWithMap', () => {
  it('test with default options', () => {
    const [program, sourceFile] = prepareSource();
    const transformer = createTransformer(program);
    const result = ts.transform(
      sourceFile,
      [transformer],
      program.getCompilerOptions()
    );
    const transformedSource = result.transformed[0]!;
    const resultData = printSourceWithMap(transformedSource, 'index.mts');
    expect(resultData[0]).toMatchSnapshot('transformed source');
    expect(resultData[1]).toMatchSnapshot('source map object');
  });
});
