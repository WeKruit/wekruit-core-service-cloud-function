import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'deploy', 'sourcing-functions');

function copy(from, to) {
  cpSync(join(root, from), join(out, to), { recursive: true });
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const pkg = {
  ...JSON.parse(await BunlessReadJson(join(root, 'package.json'))),
  scripts: {
    start: 'node lib/index.js',
  },
  devDependencies: undefined,
};

writeFileSync(join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
copy('package-lock.json', 'package-lock.json');
writeDeployNpmrc(pkg);
copy('lib/bootstrap/firebase.js', 'lib/bootstrap/firebase.js');
copy('lib/bootstrap/secrets.js', 'lib/bootstrap/secrets.js');
copy('lib/shared', 'lib/shared');
copy('lib/services/sourcing', 'lib/services/sourcing');

writeFileSync(
  join(out, 'lib', 'index.js'),
  `"use strict";

const { initializeFirebaseAdmin } = require("./bootstrap/firebase");
const { sourcingApi } = require("./services/sourcing/functions/http/api");

initializeFirebaseAdmin();

module.exports = {
  sourcing: {
    api: sourcingApi,
  },
};
`,
);

async function BunlessReadJson(path) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

function writeDeployNpmrc(pkg) {
  const lines = ['@wekruit:registry=https://npm.pkg.github.com'];
  const token = process.env.NODE_AUTH_TOKEN?.trim();
  const usesPrivateWekruitPackage = Boolean(pkg.dependencies?.['@wekruit/shared-tags']);

  if (token) {
    lines.push(`//npm.pkg.github.com/:_authToken=${token}`);
  } else if (usesPrivateWekruitPackage) {
    throw new Error(
      'NODE_AUTH_TOKEN is required to build the sourcing functions deploy bundle with private @wekruit packages.',
    );
  }

  writeFileSync(join(out, '.npmrc'), `${lines.join('\n')}\n`);
}
