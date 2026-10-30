import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const buildRoot = process.argv[2];
if (!buildRoot)
  throw new Error('Pass the verified short native build checkout path.');
const sha = (file) =>
  createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !['build', '.gradle', '.cxx'].includes(entry.name))
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name))
        : [path.join(dir, entry.name).replaceAll('\\', '/')],
    );
}
const inputs = [
  'App.tsx',
  'index.ts',
  'app.json',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'scripts/build-android.ps1',
  ...files('src'),
  ...files('assets'),
  ...files('modules'),
];
const sources = {};
for (const file of inputs) {
  sources[file] = sha(file);
  if (sources[file] !== sha(path.join(buildRoot, file)))
    throw new Error(`Build source mismatch: ${file}`);
}
const name = 'focus-sessions-1.0.0.apk';
fs.copyFileSync(path.join(buildRoot, 'demo', name), path.join('demo', name));
const hash = sha(path.join('demo', name));
fs.writeFileSync('demo/SHA256SUMS', `${hash}  ${name}\n`);
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
fs.writeFileSync(
  'demo/BUILD_PROVENANCE.json',
  JSON.stringify(
    {
      application: 'Focus Sessions',
      version: pkg.version,
      packageId: 'com.dartorange.focussessions',
      artifact: name,
      sha256: hash,
      bytes: fs.statSync(path.join('demo', name)).size,
      build: {
        platform: 'Windows x64',
        variant: 'Gradle assembleRelease, R8, bundled Hermes JavaScript',
        cloudBuild: false,
        node: process.version,
        npm: '11.20.0',
        jdk: 'Microsoft OpenJDK 17.0.21',
        gradle: '9.4.1',
        agp: '9.2.1',
        kotlin: '2.2.10',
        compileSdk: 37,
        targetSdk: 36,
        minSdk: 24,
        buildTools: '37.0.0',
        ndk: '27.1.12297006',
        cmake: '3.22.1',
        abis: ['arm64-v8a', 'x86_64'],
        signing:
          'Dedicated local demo key, RSA 3072; private inputs are external',
        certificateSha256:
          '986b3e6e414a575b7188b64327313d91ec9b9f223d8323491b1a1ebac7cd1870',
      },
      dependencies: pkg.dependencies,
      sourceSha256: sources,
    },
    null,
    2,
  ) + '\n',
);
console.log(`Packaged ${name}: ${hash}`);
