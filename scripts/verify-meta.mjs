import fs from 'node:fs';
import path from 'node:path';

function readUtf8(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

const publicPath = path.resolve(process.cwd(), 'public/chub_meta.yaml');
const distPath = path.resolve(process.cwd(), 'dist/chub_meta.yaml');

if (!fs.existsSync(publicPath)) {
  console.error(`Missing ${publicPath}`);
  process.exit(1);
}
if (!fs.existsSync(distPath)) {
  console.error(`Missing ${distPath} (run \`yarn build\` first)`);
  process.exit(1);
}

const a = readUtf8(publicPath).trimEnd();
const b = readUtf8(distPath).trimEnd();

if (a !== b) {
  console.error('dist/chub_meta.yaml is out of sync with public/chub_meta.yaml.');
  console.error('Run `yarn build` and commit the updated dist output, or remove dist from source control.');
  process.exit(1);
}

console.log('OK: dist/chub_meta.yaml matches public/chub_meta.yaml');
