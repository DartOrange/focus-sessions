import fs from 'node:fs';
import path from 'node:path';
fs.mkdirSync('demo', { recursive: true });
const notices = [];
const entries = [];
function walk(root) {
  if (!fs.existsSync(root)) return;
  for (const name of fs.readdirSync(root)) {
    if (name.startsWith('.')) continue;
    const dir = path.join(root, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    if (name.startsWith('@')) {
      walk(dir);
      continue;
    }
    const p = path.join(dir, 'package.json');
    if (!fs.existsSync(p)) continue;
    const pkg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const licenseFiles = fs
      .readdirSync(dir)
      .filter(
        (f) =>
          /^(license|licence|notice|copying)(\.|$|-)/i.test(f) &&
          fs.statSync(path.join(dir, f)).isFile(),
      );
    for (const file of licenseFiles) {
      notices.push(
        `\n${'='.repeat(72)}\n${pkg.name}@${pkg.version} / ${file}\n${'='.repeat(72)}\n${fs.readFileSync(path.join(dir, file), 'utf8')}`,
      );
    }
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license ?? 'See package sources',
      notices: licenseFiles,
    });
    walk(path.join(dir, 'node_modules'));
  }
}
walk('node_modules');
entries.sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(
  'demo/DEPENDENCY_LICENSES.json',
  JSON.stringify(entries, null, 2) + '\n',
);
fs.writeFileSync('demo/THIRD_PARTY_LICENSES.txt', notices.join('\n'));
console.log(
  `Collected notices for ${entries.length} installed runtime and build packages.`,
);
