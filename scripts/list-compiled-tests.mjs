import fs from 'node:fs';
import path from 'node:path';

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const format = process.argv.includes('--space') ? 'space' : 'lines';
const root = path.resolve(process.cwd(), 'tests');
const files = fs.existsSync(root) ? walk(root) : [];

const testSources = files
  .filter((f) => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))
  .map((f) => path.relative(process.cwd(), f).replace(/\\/g, '/'))
  .sort();

const compiled = testSources.map((rel) =>
  `.test-dist/${rel.replace(/\.(tsx?|ts)$/, '.js')}`,
);

if (format === 'space') process.stdout.write(`${compiled.join(' ')}\n`);
else process.stdout.write(`${compiled.join('\n')}\n`);
