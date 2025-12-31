import fs from 'node:fs';
import path from 'node:path';

const required = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.umd.cjs',
  'dist/index.d.ts',
];

const missing = required.filter((p) => !fs.existsSync(path.resolve(process.cwd(), p)));
if (missing.length > 0) {
  console.error('Missing expected library build outputs:');
  for (const p of missing) console.error(`- ${p}`);
  console.error('Run `yarn build --mode lib` to generate library outputs (this overwrites dist/).');
  process.exit(1);
}

console.log('OK: library dist outputs present');
