/**
 * @file Adds 'module.exports' export for specified file.
 * (See also: https://nodejs.org/api/modules.html#loading-ecmascript-modules-using-require)
 * @notes
 * This will not be necessary when typescript version is >= 5.6
 */

import * as fs from 'fs';
import { parse } from 'espree';

/** @import * as ESTree from 'estree' */

const targetFileName = process.argv[2];

const content = fs.readFileSync(targetFileName, 'utf-8');
const tree = /** @type {ESTree.Program} */ (
  parse(content, { ecmaVersion: 'latest', sourceType: 'module' })
);
const defaultDeclaration = tree.body.find(
  (node) => node.type === 'ExportDefaultDeclaration'
);
if (!defaultDeclaration) {
  console.log(`No default export found in ${targetFileName}.`);
  process.exit(1);
}

if (
  'id' in defaultDeclaration.declaration &&
  defaultDeclaration.declaration.id != null
) {
  const identifierName = defaultDeclaration.declaration.id.name;

  fs.writeFileSync(
    targetFileName,
    `${content}\nexport { ${identifierName} as 'module.exports' };\n`,
    'utf-8'
  );
  console.log(`Updated '${targetFileName}' successfully.`);
} else if (defaultDeclaration.declaration.type === 'Identifier') {
  const identifierName = defaultDeclaration.declaration.name;

  fs.writeFileSync(
    targetFileName,
    `${content}\nexport { ${identifierName} as 'module.exports' };\n`,
    'utf-8'
  );
  console.log(`Updated '${targetFileName}' successfully.`);
} else {
  console.log(
    `Default export found in '${targetFileName}' but name is not found.`
  );
}
